import { useMemo, useState, type FormEvent } from 'react';
import type { Profile } from '../../../shared/types';
import { LEVELS, profileErrors } from '../../../shared/validation';
import { timeZoneOptions } from '../time';
import { ErrorText } from './Bits';

interface Props {
  initial: Profile;
  email: string;
  submitLabel: string;
  onSubmit: (profile: Profile) => Promise<void>;
  /** Hide student-only fields (level, goals) for the teacher. */
  student?: boolean;
}

export function ProfileForm({ initial, email, submitLabel, onSubmit, student = true }: Props) {
  const [form, setForm] = useState<Profile>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };
  const zones = useMemo(() => timeZoneOptions(form.timeZone), [form.timeZone]);
  const problems = profileErrors(form);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Email
        <input value={email} disabled />
      </label>
      <label>
        Name
        <input required maxLength={100} value={form.name} onChange={(e) => set('name', e.target.value)} />
      </label>
      <label>
        Time zone
        <select value={form.timeZone} onChange={(e) => set('timeZone', e.target.value)}>
          {zones.map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
        <span className="hint">All class times are shown in this time zone.</span>
      </label>
      {student && (
        <>
          <label>
            English level
            <select value={form.level} onChange={(e) => set('level', e.target.value as Profile['level'])}>
              <option value="">Not sure</option>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Native language
            <input maxLength={60} value={form.nativeLanguage} onChange={(e) => set('nativeLanguage', e.target.value)} />
          </label>
          <label>
            Learning goals
            <textarea
              maxLength={1000}
              placeholder="e.g. business meetings, travel, exam preparation"
              value={form.goals}
              onChange={(e) => set('goals', e.target.value)}
            />
          </label>
        </>
      )}
      <label>
        Contact (optional)
        <input
          maxLength={200}
          placeholder="Phone, LINE, Skype…"
          value={form.contact}
          onChange={(e) => set('contact', e.target.value)}
        />
      </label>
      {problems.length > 0 && form !== initial && (
        <ul className="error">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <ErrorText error={error} />
      {saved && <p className="success">Saved.</p>}
      <button type="submit" className="primary" disabled={saving || problems.length > 0}>
        {saving ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
