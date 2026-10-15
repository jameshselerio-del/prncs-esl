import { useState, type FormEvent } from 'react';
import type { LessonInput } from '../../../../shared/api';
import type { Lesson } from '../../../../shared/types';
import { LEVELS, lessonErrors } from '../../../../shared/validation';
import { useApi, useQuery } from '../../api';
import { ErrorText, LessonCard } from '../../components/Bits';
import { Modal } from '../../components/Modal';

const EMPTY: LessonInput = { title: '', level: '', summary: '', content: '', materialsUrl: '' };

export function Lessons() {
  const lessons = useQuery('lessons');
  const [editing, setEditing] = useState<LessonInput | null>(null);

  return (
    <>
      <div className="toolbar">
        <h2>Lessons</h2>
        <button type="button" className="primary" onClick={() => setEditing(EMPTY)}>
          New lesson
        </button>
      </div>
      <p className="hint">
        Students see these on their Home page. Assign a lesson to a class from Bookings to show its contents with that
        class.
      </p>
      <ErrorText error={lessons.error} />
      {!lessons.data ? (
        <p>Loading…</p>
      ) : lessons.data.length === 0 ? (
        <p className="empty">No lessons yet.</p>
      ) : (
        lessons.data.map((l: Lesson) => (
          <div key={l.id} className="lesson-row">
            <LessonCard lesson={l} />
            <button type="button" onClick={() => setEditing(l)}>
              Edit
            </button>
          </div>
        ))
      )}
      {editing && (
        <LessonEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            lessons.reload();
          }}
        />
      )}
    </>
  );
}

function LessonEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: LessonInput;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useApi();
  const [form, setForm] = useState<LessonInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof LessonInput) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const problems = lessonErrors(form);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void run(() => api('saveLesson', form));
  }

  return (
    <Modal title={initial.id ? 'Edit lesson' : 'New lesson'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          Title
          <input required maxLength={120} value={form.title} onChange={(e) => set('title')(e.target.value)} />
        </label>
        <label>
          Level
          <select value={form.level} onChange={(e) => set('level')(e.target.value)}>
            <option value="">Any level</option>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Summary
          <input maxLength={500} value={form.summary} onChange={(e) => set('summary')(e.target.value)} />
        </label>
        <label>
          Contents
          <textarea
            className="tall"
            maxLength={20000}
            placeholder={'Objectives, vocabulary, dialogue…\n\nLeave a blank line between paragraphs.'}
            value={form.content}
            onChange={(e) => set('content')(e.target.value)}
          />
        </label>
        <label>
          Materials link
          <input
            type="url"
            placeholder="https://"
            value={form.materialsUrl}
            onChange={(e) => set('materialsUrl')(e.target.value)}
          />
        </label>
        {problems.length > 0 && form !== initial && <ErrorText error={problems.join('\n')} />}
        <ErrorText error={error} />
        <div className="actions">
          <button type="submit" className="primary" disabled={busy || problems.length > 0}>
            Save lesson
          </button>
          {initial.id && (
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Delete "${initial.title}"?`))
                  void run(() => api('deleteLesson', { id: initial.id! }));
              }}
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
