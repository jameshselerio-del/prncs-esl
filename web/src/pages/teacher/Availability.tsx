import { useState, type FormEvent } from 'react';
import type { Schedule, TeacherBooking } from '../../../../shared/api';
import { TEACHER_TIME_ZONE } from '../../../../shared/time';
import type { AvailabilityRule, Settings, TimeOff, Weekday } from '../../../../shared/types';
import { availabilityErrors, settingsErrors, timeOffErrors } from '../../../../shared/validation';
import { useApi, useQuery } from '../../api';
import { ErrorText } from '../../components/Bits';
import { useSession } from '../../session';
import { localDateKey } from '../../time';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type Range = Omit<AvailabilityRule, 'id'>;

const NUMBER_FIELDS: { key: keyof Settings; label: string; hint: string }[] = [
  { key: 'lessonMinutes', label: 'Lesson length (minutes)', hint: '15–180' },
  { key: 'slotStepMinutes', label: 'Start times every (minutes)', hint: 'e.g. 30 → 9:00, 9:30, 10:00' },
  { key: 'minNoticeHours', label: 'Minimum notice to book (hours)', hint: '0–168' },
  { key: 'bookingWindowDays', label: 'Students can book up to (days ahead)', hint: '1–180' },
  { key: 'cancelNoticeHours', label: 'Students can cancel until (hours before)', hint: '0–168' },
  { key: 'maxUpcomingPerStudent', label: 'Max upcoming classes per student', hint: '1–50' },
];

export function Availability() {
  const schedule = useQuery('schedule');
  const bookings = useQuery('allBookings');
  if (schedule.error) return <ErrorText error={schedule.error} />;
  if (!schedule.data) return <p>Loading…</p>;
  return <AvailabilityEditor initial={schedule.data} bookings={bookings.data ?? []} />;
}

/** Mounted once the schedule has loaded, so editable state starts from the saved values. */
function AvailabilityEditor({ initial, bookings }: { initial: Schedule; bookings: TeacherBooking[] }) {
  const api = useApi();
  const { refresh } = useSession();
  const [rules, setRules] = useState<Range[]>(() =>
    initial.rules.map(({ weekday, start, end }) => ({ weekday, start, end })),
  );
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [timeOff, setTimeOff] = useState<TimeOff[]>(initial.timeOff);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState({ startDate: '', endDate: '', note: '' });
  const [offError, setOffError] = useState<string | null>(null);

  const problems = [...availabilityErrors(rules.map((r, i) => ({ ...r, id: String(i) }))), ...settingsErrors(settings)];
  const edit = (next: Range[]) => {
    setSaved(false);
    setRules(next);
  };
  const setSetting = (key: keyof Settings, value: string) => {
    setSaved(false);
    setSettings({ ...settings, [key]: typeof settings[key] === 'number' ? Number(value) : value });
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await api('saveSchedule', { rules, settings });
      setRules(result.rules.map(({ weekday, start, end }) => ({ weekday, start, end })));
      setSaved(true);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function addOff(e: FormEvent) {
    e.preventDefault();
    const errors = timeOffErrors(off);
    if (errors.length) return setOffError(errors.join('\n'));
    setOffError(null);
    try {
      const created = await api('addTimeOff', off);
      setTimeOff((list) => [...list, created]);
      setOff({ startDate: '', endDate: '', note: '' });
    } catch (err) {
      setOffError((err as Error).message);
    }
  }

  async function removeOff(id: string) {
    try {
      await api('removeTimeOff', { id });
      setTimeOff((list) => list.filter((t) => t.id !== id));
    } catch (err) {
      setOffError((err as Error).message);
    }
  }

  /** Confirmed classes already booked inside a time-off range (they are not cancelled automatically). */
  const clashes = (t: Pick<TimeOff, 'startDate' | 'endDate'>) =>
    bookings.filter((b) => {
      const day = localDateKey(b.start, TEACHER_TIME_ZONE);
      return b.status === 'CONFIRMED' && day >= t.startDate && day <= t.endDate;
    }).length;

  return (
    <>
      <h2>Availability</h2>
      <p className="hint">Times are in {TEACHER_TIME_ZONE}. Students see open slots in their own time zone.</p>

      <form className="form wide" onSubmit={save}>
        <fieldset>
          <legend>Weekly hours</legend>
          {DAYS.map((day, d) => {
            const ranges = rules.map((r, i) => ({ r, i })).filter(({ r }) => r.weekday === d);
            return (
              <div key={day} className="week-row">
                <strong>{day}</strong>
                <div className="ranges">
                  {ranges.length === 0 && <span className="hint">Unavailable</span>}
                  {ranges.map(({ r, i }) => (
                    <span key={i} className="range">
                      <input
                        type="time"
                        aria-label={`${day} start`}
                        value={r.start}
                        onChange={(e) => edit(rules.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))}
                      />
                      –
                      <input
                        type="time"
                        aria-label={`${day} end`}
                        value={r.end === '24:00' ? '23:59' : r.end}
                        onChange={(e) => edit(rules.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))}
                      />
                      <button
                        type="button"
                        className="icon"
                        aria-label={`Remove ${day} ${r.start}–${r.end}`}
                        onClick={() => edit(rules.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    className="link"
                    onClick={() => edit([...rules, { weekday: d as Weekday, start: '09:00', end: '12:00' }])}
                  >
                    + Add hours
                  </button>
                </div>
              </div>
            );
          })}
        </fieldset>

        <fieldset>
          <legend>Booking settings</legend>
          <div className="settings-grid">
            <label>
              School name (used in emails)
              <input
                maxLength={100}
                value={settings.schoolName}
                onChange={(e) => setSetting('schoolName', e.target.value)}
              />
            </label>
            <label>
              Default meeting link
              <input
                type="url"
                placeholder="https://"
                value={settings.defaultMeetingLink}
                onChange={(e) => setSetting('defaultMeetingLink', e.target.value)}
              />
              <span className="hint">Added to every new booking; you can change it per class.</span>
            </label>
            {NUMBER_FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <input
                  type="number"
                  inputMode="numeric"
                  value={settings[f.key] as number}
                  onChange={(e) => setSetting(f.key, e.target.value)}
                />
                <span className="hint">{f.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {problems.length > 0 && <ErrorText error={problems.join('\n')} />}
        <ErrorText error={error} />
        {saved && <p className="success">Availability saved.</p>}
        <button type="submit" className="primary" disabled={saving || problems.length > 0}>
          {saving ? 'Saving…' : 'Save availability'}
        </button>
      </form>

      <h3>Time off</h3>
      <p className="hint">
        No slots are offered on these days. Classes already booked are not cancelled automatically.
      </p>
      {timeOff.length > 0 && (
        <ul className="list">
          {[...timeOff]
            .sort((a, b) => a.startDate.localeCompare(b.startDate))
            .map((t) => (
              <li key={t.id} className="row-between">
                <span>
                  {t.startDate === t.endDate ? t.startDate : `${t.startDate} → ${t.endDate}`}
                  {t.note && <span className="hint"> · {t.note}</span>}
                  {clashes(t) > 0 && <span className="notice"> · {clashes(t)} booked class(es) to review</span>}
                </span>
                <button type="button" onClick={() => removeOff(t.id)}>
                  Remove
                </button>
              </li>
            ))}
        </ul>
      )}
      <form className="form row" onSubmit={addOff}>
        <label>
          From
          <input
            type="date"
            required
            value={off.startDate}
            onChange={(e) => setOff({ ...off, startDate: e.target.value, endDate: off.endDate || e.target.value })}
          />
        </label>
        <label>
          To
          <input
            type="date"
            required
            min={off.startDate}
            value={off.endDate}
            onChange={(e) => setOff({ ...off, endDate: e.target.value })}
          />
        </label>
        <label>
          Note
          <input maxLength={200} value={off.note} onChange={(e) => setOff({ ...off, note: e.target.value })} />
        </label>
        <button type="submit">Add time off</button>
      </form>
      {off.startDate && off.endDate && clashes(off) > 0 && (
        <p className="notice">
          {clashes(off)} confirmed class(es) fall in this range; cancel them from Bookings if needed.
        </p>
      )}
      <ErrorText error={offError} />
    </>
  );
}
