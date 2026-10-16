import { describe, expect, it } from 'vitest';
import { notificationText, todosFor, todoText } from './notifications';

const NOW = new Date('2026-10-16T02:00:00.000Z');
const minutes = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();
const booking = (id: string, startMin: number, status = 'CONFIRMED' as const) => ({
  id,
  start: minutes(startMin),
  end: minutes(startMin + 50),
  status,
  meetingLink: 'https://meet.example.com/x',
  studentName: 'Yuki Tanaka',
});

const student = { role: 'STUDENT' as const, level: 'INTERMEDIATE' as const };

describe('todosFor', () => {
  it('suggests a password and a level until done or dismissed', () => {
    const base = { bookings: [], now: NOW, dismissed: [] };
    expect(todosFor({ ...base, user: { role: 'STUDENT', level: '' }, hasPassword: false }).map((t) => t.id)).toEqual([
      'set-password',
      'add-level',
    ]);
    expect(todosFor({ ...base, user: student, hasPassword: true })).toEqual([]);
    expect(
      todosFor({ ...base, user: { role: 'STUDENT', level: '' }, hasPassword: false, dismissed: ['set-password'] }).map(
        (t) => t.id,
      ),
    ).toEqual(['add-level']);
  });

  it('shows a class from 15 minutes before it starts until it ends', () => {
    const ids = (startMin: number) =>
      todosFor({ user: student, hasPassword: true, bookings: [booking('b', startMin)], now: NOW, dismissed: [] }).map(
        (t) => t.id,
      );
    expect(ids(16)).toEqual([]);
    expect(ids(15)).toEqual(['class-soon:b']);
    expect(ids(-49)).toEqual(['class-soon:b']);
    expect(ids(-50)).toEqual([]);
  });

  it('ignores cancelled classes and only names the student for the teacher', () => {
    const todos = (role: 'STUDENT' | 'ADMIN', b: ReturnType<typeof booking>) =>
      todosFor({ user: { role, level: '' }, hasPassword: true, bookings: [b], now: NOW, dismissed: ['add-level'] });
    expect(todos('STUDENT', { ...booking('c', 5), status: 'CANCELLED' as never })).toEqual([]);
    expect(todos('STUDENT', booking('b', 5))[0].studentName).toBeUndefined();
    expect(todos('ADMIN', booking('b', 5))[0].studentName).toBe('Yuki Tanaka');
  });

  it('asks the teacher to record outcomes for finished confirmed classes', () => {
    const todos = todosFor({
      user: { role: 'ADMIN', level: '' },
      hasPassword: true,
      bookings: [booking('a', -120), booking('b', -60), booking('c', -10), booking('d', -200, 'COMPLETED' as never)],
      now: NOW,
      dismissed: [],
    });
    expect(todos.find((t) => t.kind === 'RECORD_OUTCOMES')?.count).toBe(2);
    expect(todoText(todos.find((t) => t.kind === 'RECORD_OUTCOMES')!).title).toBe(
      'Mark 2 past classes as completed or no-show',
    );
  });
});

describe('notificationText', () => {
  it('describes each event with the class time and only safe details', () => {
    expect(notificationText({ kind: 'CANCELLED_BY_TEACHER', actorName: '', detail: 'Sick' }, 'Mon, Oct 19')).toEqual({
      title: 'Your teacher cancelled your class on Mon, Oct 19.',
      detail: 'Reason: Sick',
    });
    expect(notificationText({ kind: 'NEW_BOOKING', actorName: 'Yuki', detail: '' }, 'Mon').title).toBe(
      'Yuki booked a class on Mon.',
    );
  });
});
