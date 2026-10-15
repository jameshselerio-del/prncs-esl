// End-to-end tests of the bundled backend (dist/backend/Code.js) against in-memory Google fakes.
import { execFileSync } from 'node:child_process';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClock } from './fakes.mjs';
import { loadBackend, mockToken } from './backend.mjs';
import { seed, STUDENTS, TEACHER } from './seed.mjs';

const HOUR = 3_600_000;
const NOW = '2026-10-14T00:00:00.000Z'; // Wednesday 08:00 in Manila

const quiet = { log() {}, info() {}, warn() {}, error() {} };
const teacher = mockToken(TEACHER.email, TEACHER.name);
const [yuki, minh] = STUDENTS.map((s) => mockToken(s.email, s.name));

let backend;

function fresh({ seeded = true } = {}) {
  const clock = createClock();
  clock.set(NOW);
  const b = loadBackend({ log: quiet, clock });
  if (seeded) seed(b);
  return b;
}

/** Calls an action and returns its data, failing the test on an API error. */
function ok(token, action, payload) {
  const res = backend.call(token, action, payload);
  if (!res.ok) throw new Error(`${action} failed: ${res.error}`);
  return res.data;
}

/** Calls an action that must fail and returns its error response. */
function err(token, action, payload) {
  const res = backend.call(token, action, payload);
  expect(res.ok, `${action} should fail`).toBe(false);
  return res;
}

const book = (token, start) => backend.call(token, 'book', { start, topic: '', studentNote: '' });
const mailTo = (email) => backend.state.mail.filter((m) => m.to === email);

beforeAll(() => {
  execFileSync(process.execPath, ['backend/build.mjs'], { stdio: 'ignore' });
});

beforeEach(() => {
  backend = fresh();
});

describe('setupDatabase', () => {
  it('migrates a leave-tracking Users tab and keeps the old leave tabs', () => {
    backend = fresh({ seeded: false });
    const ss = backend.google.SpreadsheetApp.create('Leave tracking');
    backend.state.properties.set('SPREADSHEET_ID', ss.getId());
    const legacyHeader = [
      'email',
      'name',
      'office',
      'role',
      'managerEmail',
      'status',
      'regularizedOn',
      'workingDays',
      'active',
    ];
    ss.insertSheet('Users', [
      legacyHeader,
      ['Boss@Example.com', 'Boss', 'PH', 'ADMIN', '', 'REGULAR', '', 'Mon-Fri', 'TRUE'],
      ['ken@example.com', 'Ken', 'JP', 'EMPLOYEE', 'boss@example.com', 'REGULAR', '', 'Mon-Fri', 'TRUE'],
      ['gone@example.com', 'Gone', 'PH', 'EMPLOYEE', '', 'PROBATION', '', 'Mon-Fri', 'FALSE'],
    ]);
    ss.insertSheet('Requests', [
      ['id', 'email'],
      ['r1', 'ken@example.com'],
    ]);

    backend.setupDatabase();

    const users = backend.sheet('Users');
    expect(users.data[0]).toEqual([
      'email',
      'name',
      'role',
      'active',
      'timeZone',
      'level',
      'nativeLanguage',
      'goals',
      'contact',
      'createdAt',
    ]);
    expect(users.records().map(({ email, role, active, timeZone }) => ({ email, role, active, timeZone }))).toEqual([
      { email: 'boss@example.com', role: 'ADMIN', active: 'TRUE', timeZone: 'Asia/Manila' },
      { email: 'ken@example.com', role: 'STUDENT', active: 'TRUE', timeZone: 'Asia/Tokyo' },
      { email: 'gone@example.com', role: 'STUDENT', active: 'FALSE', timeZone: 'Asia/Manila' },
    ]);
    expect(ss.getSheets().map((s) => s.getName())).toEqual(
      expect.arrayContaining(['old_Requests', 'Bookings', 'Availability', 'Lessons', 'TimeOff', 'Settings']),
    );
    expect(ss.getSheetByName('Requests')).toBeNull();
    expect(ss.getSheetByName('Sheet1')).toBeNull();

    // Running it again changes nothing, and the migrated admin is the teacher.
    backend.setupDatabase();
    expect(backend.sheet('Users').records()).toHaveLength(3);
    expect(ok('boss@example.com|Boss', 'me').user.role).toBe('ADMIN');
    expect(err('gone@example.com|Gone', 'me').code).toBe('AUTH');
  });
});

describe('sign-in and sign-up', () => {
  const newStudent = mockToken('nora@example.com', 'Nora New');
  const profile = {
    name: 'Nora',
    timeZone: 'Europe/Berlin',
    level: '',
    nativeLanguage: 'German',
    goals: '',
    contact: '',
  };

  it('rejects missing and invalid tokens', () => {
    expect(err('', 'me').code).toBe('AUTH');
    expect(err('not-a-token', 'me').code).toBe('AUTH');
  });

  it('lets a new Google user register as a student', () => {
    expect(ok(newStudent, 'me')).toMatchObject({
      registered: false,
      email: 'nora@example.com',
      suggestedName: 'Nora New',
    });
    expect(err(newStudent, 'availability').error).toMatch(/complete your profile/);
    expect(err(newStudent, 'register', { ...profile, timeZone: 'Tokyo' }).error).toMatch(/time zone/);

    const user = ok(newStudent, 'register', profile);
    expect(user).toMatchObject({ email: 'nora@example.com', role: 'STUDENT', active: true, timeZone: 'Europe/Berlin' });
    expect(ok(newStudent, 'me')).toMatchObject({ registered: true, user: { name: 'Nora' } });
    expect(err(newStudent, 'register', profile).error).toMatch(/already registered/);
    expect(ok(newStudent, 'availability').length).toBeGreaterThan(0);
  });
});

describe('booking', () => {
  it('books a free slot, notifies both sides and removes the slot', () => {
    const [slot] = ok(yuki, 'availability');
    // Minimum notice is 12 hours.
    expect(Date.parse(slot.start) - Date.parse(NOW)).toBeGreaterThanOrEqual(12 * HOUR);

    const booking = ok(yuki, 'book', { start: slot.start, topic: 'Travel', studentNote: 'Hi!' });
    expect(booking).toMatchObject({ studentEmail: 'yuki@example.com', status: 'CONFIRMED', topic: 'Travel' });
    expect(booking).not.toHaveProperty('privateNote');
    expect(mailTo('yuki@example.com').map((m) => m.subject)).toEqual(['[ESL Classes (mock)] Your class is booked']);
    expect(mailTo(TEACHER.email)[0].body).toContain('Yuki Tanaka');
    expect(ok(yuki, 'availability').some((s) => s.start === slot.start)).toBe(false);
    expect(ok(teacher, 'allBookings').find((b) => b.id === booking.id)).toMatchObject({ studentName: 'Yuki Tanaka' });
  });

  it('rejects double-booking, off-schedule times and teacher bookings', () => {
    const [slot] = ok(yuki, 'availability');
    expect(book(yuki, slot.start).ok).toBe(true);
    expect(book(minh, slot.start).error).toMatch(/no longer available/);
    // 30 minutes later overlaps the 50-minute class.
    const overlapping = new Date(Date.parse(slot.start) + 30 * 60_000).toISOString();
    expect(book(minh, overlapping).error).toMatch(/no longer available/);
    expect(book(minh, '2026-10-17T02:00:00.000Z').error).toMatch(/no longer available/); // Saturday
    expect(book(minh, 'garbage').ok).toBe(false);
    expect(book(teacher, ok(yuki, 'availability')[0].start).error).toMatch(/Only students/);
  });

  it('limits how many upcoming classes a student holds', () => {
    // Yuki already has one upcoming class from the seed; the default limit is 5.
    const slots = ok(yuki, 'availability');
    for (let i = 0; i < 4; i++) expect(book(yuki, slots[i * 4].start).ok).toBe(true);
    expect(book(yuki, slots[30].start).error).toMatch(/already have 5 upcoming classes/);
    expect(book(minh, slots[30].start).ok).toBe(true);
  });
});

describe('calendar invites', () => {
  const ics = (message) => message.attachments?.[0]?.getDataAsString().replace(/\r\n /g, '') ?? '';

  it('attaches an invite to the student and an event to the teacher, then cancels both', () => {
    const [slot] = ok(yuki, 'availability');
    const booking = ok(yuki, 'book', { start: slot.start, topic: 'Travel', studentNote: '' });
    const [studentMail] = mailTo('yuki@example.com');
    const [teacherMail] = mailTo(TEACHER.email);
    const stamp = slot.start.replace(/[-:]/g, '').replace(/\.\d{3}/, '');

    expect(studentMail.attachments[0].getContentType()).toBe('text/calendar; charset=utf-8; method=REQUEST');
    expect(ics(studentMail)).toContain(`UID:${booking.id}@prncs-esl`);
    expect(ics(studentMail)).toContain(`DTSTART:${stamp}`);
    expect(ics(studentMail)).toContain(`ORGANIZER;CN="${TEACHER.name}":mailto:${TEACHER.email}`);
    expect(ics(studentMail)).toContain('mailto:yuki@example.com');
    expect(ics(teacherMail)).toContain('METHOD:PUBLISH');
    expect(ics(teacherMail)).toContain('SUMMARY:English class: Yuki Tanaka');

    ok(yuki, 'cancelBooking', { id: booking.id, reason: '' });
    const studentCancel = mailTo('yuki@example.com').at(-1);
    const teacherCancel = mailTo(TEACHER.email).at(-1);
    for (const m of [studentCancel, teacherCancel]) {
      expect(ics(m)).toContain('METHOD:CANCEL');
      expect(ics(m)).toContain('SEQUENCE:1');
      expect(ics(m)).toContain(`UID:${booking.id}@prncs-esl`);
    }
    expect(studentCancel.subject).toMatch(/You cancelled a class/);
  });

  it('sends no invite with reminders', () => {
    const next = ok(yuki, 'myBookings').find((b) => b.id === 'booking-yuki-next');
    backend.clock.set(Date.parse(next.start) - 20 * HOUR);
    backend.sendReminders();
    const reminders = backend.state.mail.filter((x) => /Reminder/.test(x.subject));
    expect(reminders.length).toBeGreaterThan(0);
    for (const m of reminders) expect(m.attachments ?? []).toEqual([]);
  });
});

describe('teacher books for a student', () => {
  const saturday = '2026-10-17T02:00:00.000Z'; // outside weekly availability
  const forYuki = (start, extra = {}) =>
    backend.call(teacher, 'bookForStudent', {
      studentEmail: 'Yuki@Example.com',
      start,
      topic: 'Make-up class',
      studentNote: '',
      ...extra,
    });

  it('books any free future time, emails only the student, and blocks that time for others', () => {
    const res = forYuki(saturday);
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({
      studentEmail: 'yuki@example.com',
      studentName: 'Yuki Tanaka',
      status: 'CONFIRMED',
    });
    expect(mailTo('yuki@example.com').map((m) => m.subject)).toEqual([
      '[ESL Classes (mock)] Your teacher booked a class for you',
    ]);
    expect(mailTo(TEACHER.email)).toEqual([]);
    expect(ok(yuki, 'myBookings').some((b) => b.id === res.data.id)).toBe(true);
    expect(forYuki(new Date(Date.parse(saturday) + 20 * 60_000).toISOString()).error).toMatch(/overlaps/);
  });

  it('rejects past times, students calling it, unknown and deactivated students', () => {
    expect(forYuki('2026-10-13T02:00:00.000Z').error).toMatch(/future/);
    expect(err(yuki, 'bookForStudent', { studentEmail: 'yuki@example.com', start: saturday }).error).toMatch(
      /Only the teacher/,
    );
    expect(forYuki(saturday, { studentEmail: TEACHER.email }).error).toBe('Student not found.');
    ok(teacher, 'setStudentActive', { email: 'yuki@example.com', active: false });
    expect(forYuki(saturday).error).toMatch(/deactivated/);
  });
});

describe('cancelling', () => {
  it('lets students cancel their own classes only before the notice period', () => {
    const later = ok(yuki, 'myBookings').find((b) => b.id === 'booking-yuki-next');
    expect(err(minh, 'cancelBooking', { id: later.id, reason: '' }).error).toBe('Booking not found.');

    const cancelled = ok(yuki, 'cancelBooking', { id: later.id, reason: 'Sick' });
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelledBy: 'yuki@example.com', cancelReason: 'Sick' });
    expect(cancelled).not.toHaveProperty('privateNote');
    expect(mailTo(TEACHER.email).at(-1).subject).toMatch(/Cancelled: Yuki Tanaka/);
    expect(ok(yuki, 'availability').some((s) => s.start === later.start)).toBe(true);
    expect(err(yuki, 'cancelBooking', { id: later.id, reason: '' }).ok).toBe(false);

    // Inside the 24-hour notice window the student can no longer cancel.
    const minhNext = ok(minh, 'myBookings').find((b) => b.status === 'CONFIRMED');
    backend.clock.set(Date.parse(minhNext.start) - 23 * HOUR);
    expect(err(minh, 'cancelBooking', { id: minhNext.id, reason: '' }).error).toMatch(/at least 24 hours/);
  });

  it('lets the teacher cancel any upcoming class but not past ones', () => {
    const minhNext = ok(minh, 'myBookings').find((b) => b.status === 'CONFIRMED');
    backend.clock.set(Date.parse(minhNext.start) - HOUR);
    const cancelled = ok(teacher, 'cancelBooking', { id: minhNext.id, reason: 'Power outage' });
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelledBy: TEACHER.email });
    expect(mailTo('minh@example.com').at(-1)).toMatchObject({
      subject: '[ESL Classes (mock)] Your class was cancelled',
    });
    expect(mailTo('minh@example.com').at(-1).body).toContain('Reason: Power outage');

    expect(err(teacher, 'cancelBooking', { id: 'booking-yuki-past', reason: '' }).error).toMatch(/Only upcoming/);
    expect(err(teacher, 'cancelBooking', { id: 'nope', reason: '' }).error).toBe('Booking not found.');
  });
});

describe('teacher-only data', () => {
  it('never sends private notes to students', () => {
    const past = ok(yuki, 'myBookings').find((b) => b.id === 'booking-yuki-past');
    expect(past.feedback).toMatch(/Great progress/);
    expect(past).not.toHaveProperty('privateNote');
    expect(backend.post(JSON.stringify({ action: 'myBookings', idToken: yuki }))).not.toContain('push for longer');

    const updated = ok(teacher, 'updateBooking', {
      id: 'booking-yuki-next',
      lessonId: 'lesson-interviews',
      topic: 'Emails',
      meetingLink: 'https://meet.example.com/x',
      materials: '',
      feedback: '',
      privateNote: 'Secret plan',
    });
    expect(updated.privateNote).toBe('Secret plan');
    expect(JSON.stringify(ok(yuki, 'myBookings'))).not.toContain('Secret plan');
    expect(ok(teacher, 'allBookings').find((b) => b.id === 'booking-yuki-next').privateNote).toBe('Secret plan');
  });

  it('rejects teacher actions from students', () => {
    for (const action of ['allBookings', 'students', 'schedule', 'updateBooking', 'setStudentActive', 'saveLesson']) {
      expect(err(yuki, action, {}).error).toBe('Only the teacher can do this.');
    }
  });

  it('records outcomes only after a class has started', () => {
    const details = {
      id: 'booking-yuki-next',
      lessonId: '',
      topic: '',
      meetingLink: '',
      materials: '',
      feedback: '',
      privateNote: '',
    };
    expect(err(teacher, 'updateBooking', { ...details, status: 'COMPLETED' }).error).toMatch(
      /after the class has started/,
    );
    backend.clock.set(Date.parse(ok(yuki, 'myBookings').find((b) => b.id === details.id).start) + HOUR);
    expect(ok(teacher, 'updateBooking', { ...details, status: 'NO_SHOW' }).status).toBe('NO_SHOW');
  });
});

describe('sendReminders', () => {
  it('emails each class starting within 24 hours exactly once', () => {
    const yukiNext = ok(yuki, 'myBookings').find((b) => b.id === 'booking-yuki-next');
    backend.clock.set(Date.parse(yukiNext.start) - 20 * HOUR);

    backend.sendReminders();
    const reminders = backend.state.mail.filter((m) => m.subject.includes('Reminder'));
    expect(reminders.map((m) => m.to)).toEqual(['yuki@example.com']);
    // Times are shown in the student's own time zone (Tokyo is Manila + 1h).
    expect(reminders[0].body).toMatch(/11:00 AM – 11:50 AM \(Asia\/Tokyo\)/);
    expect(
      backend
        .sheet('Bookings')
        .records()
        .find((r) => r.id === yukiNext.id).reminderSentAt,
    ).not.toBe('');

    backend.sendReminders();
    expect(backend.state.mail.filter((m) => m.subject.includes('Reminder'))).toHaveLength(1);
  });
});

describe('deactivation', () => {
  it('blocks a deactivated student until reactivated', () => {
    expect(ok(teacher, 'setStudentActive', { email: 'minh@example.com', active: false }).active).toBe(false);
    expect(err(minh, 'me')).toMatchObject({ code: 'AUTH', error: expect.stringMatching(/deactivated/) });
    expect(err(minh, 'availability').code).toBe('AUTH');

    // No reminder for a deactivated student's class.
    const minhNext = backend
      .sheet('Bookings')
      .records()
      .find((r) => r.id === 'booking-minh-next');
    backend.clock.set(Date.parse(minhNext.start) - 2 * HOUR);
    backend.sendReminders();
    expect(mailTo('minh@example.com')).toHaveLength(0);

    expect(err(teacher, 'setStudentActive', { email: TEACHER.email, active: false }).error).toBe('Student not found.');
    ok(teacher, 'setStudentActive', { email: 'minh@example.com', active: true });
    expect(ok(minh, 'me').registered).toBe(true);
  });
});
