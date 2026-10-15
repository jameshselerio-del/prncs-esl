import { DAY_MS, HOUR_MS, MINUTE_MS, TEACHER_UTC_OFFSET_MINUTES } from '../../shared/time';
import type { Booking, Lesson, User, Weekday } from '../../shared/types';
import { db } from './db';
import { ensureDatabase } from './setup';

/** Demo students use the reserved .invalid domain: they can't sign in, and mail.ts never emails them. */
export const DEMO_DOMAIN = '@demo.invalid';

const OFFSET_MS = TEACHER_UTC_OFFSET_MINUTES * MINUTE_MS;

/** UTC instant of `hour`:00 Manila time on the first weekday at least `days` days from `now`. */
function manilaWeekdayAt(now: number, days: number, hour: number): Date {
  const date = new Date(now + days * DAY_MS + OFFSET_MS);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setTime(date.getTime() + DAY_MS);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour) - OFFSET_MS);
}

/**
 * Run from the Apps Script editor of the **staging** project only (script property
 * ENVIRONMENT=staging). Fills an empty database with a teacher (ADMIN_EMAIL), demo
 * students, weekday availability, lessons and bookings, so the app can be explored at once.
 */
export function seedDemoData(): void {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('ENVIRONMENT') !== 'staging') {
    throw new Error('seedDemoData only runs when the script property ENVIRONMENT is "staging".');
  }
  const teacherEmail = (props.getProperty('ADMIN_EMAIL') ?? '').trim().toLowerCase();
  if (!teacherEmail) throw new Error('Set the script property ADMIN_EMAIL to the Google account of the teacher.');

  ensureDatabase();
  if (db.bookings().length || db.lessons().length) {
    throw new Error('The staging database already has data. Clear the tabs first to re-seed.');
  }

  const now = Date.now();
  const createdAt = new Date(now - 30 * DAY_MS).toISOString();
  const user = (u: Partial<User> & Pick<User, 'email' | 'name' | 'timeZone'>): User => ({
    role: 'STUDENT',
    active: true,
    level: '',
    nativeLanguage: '',
    goals: '',
    contact: '',
    createdAt,
    ...u,
  });

  const existing = db.users();
  const teacher = existing.find((u) => u.email === teacherEmail);
  if (!teacher)
    db.insertUser(user({ email: teacherEmail, name: 'Teacher (staging)', timeZone: 'Asia/Manila', role: 'ADMIN' }));
  else if (teacher.role !== 'ADMIN') db.updateUser({ ...teacher, role: 'ADMIN', active: true });

  const students = [
    user({
      email: `yuki${DEMO_DOMAIN}`,
      name: 'Yuki Tanaka (demo)',
      timeZone: 'Asia/Tokyo',
      level: 'INTERMEDIATE',
      nativeLanguage: 'Japanese',
      goals: 'Business emails and meetings.',
    }),
    user({
      email: `minh${DEMO_DOMAIN}`,
      name: 'Minh Nguyen (demo)',
      timeZone: 'Asia/Ho_Chi_Minh',
      level: 'BEGINNER',
      nativeLanguage: 'Vietnamese',
      goals: 'Everyday conversation.',
    }),
    user({
      email: `sofia${DEMO_DOMAIN}`,
      name: 'Sofía García (demo)',
      timeZone: 'Europe/Madrid',
      level: 'ADVANCED',
      nativeLanguage: 'Spanish',
      goals: 'Job interviews.',
    }),
  ];
  for (const s of students) if (!existing.some((u) => u.email === s.email)) db.insertUser(s);

  db.replaceRules(
    ([1, 2, 3, 4, 5] as Weekday[]).flatMap((weekday) => [
      { id: Utilities.getUuid(), weekday, start: '09:00', end: '12:00' },
      { id: Utilities.getUuid(), weekday, start: '14:00', end: '18:00' },
    ]),
  );
  db.saveSettings({ ...db.settings(), schoolName: 'Komorebi English (staging)' });

  const lessons: Lesson[] = [
    {
      id: Utilities.getUuid(),
      title: 'Small talk at work',
      level: 'ELEMENTARY',
      summary: 'Greetings, weekend plans and polite follow-up questions.',
      content: 'Warm-up: describe your weekend in three sentences.\n\nRole-play: meeting a new colleague.',
      materialsUrl: '',
      createdAt,
    },
    {
      id: Utilities.getUuid(),
      title: 'Job interview practice',
      level: 'UPPER_INTERMEDIATE',
      summary: 'Answering common interview questions with the STAR method.',
      content: 'Tell me about yourself.\n\nDescribe a challenge you solved at work.',
      materialsUrl: '',
      createdAt,
    },
  ];
  lessons.forEach(db.insertLesson);

  const settings = db.settings();
  const booking = (studentEmail: string, start: Date, fields: Partial<Booking> = {}): Booking => ({
    id: Utilities.getUuid(),
    studentEmail,
    start: start.toISOString(),
    end: new Date(start.getTime() + settings.lessonMinutes * MINUTE_MS).toISOString(),
    status: 'CONFIRMED',
    lessonId: null,
    topic: '',
    studentNote: '',
    meetingLink: settings.defaultMeetingLink,
    materials: '',
    feedback: '',
    privateNote: '',
    createdAt: new Date(start.getTime() - 7 * DAY_MS).toISOString(),
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: '',
    // Demo students are never emailed; marking reminders as sent keeps the hourly job quiet.
    reminderSentAt: new Date(now - HOUR_MS).toISOString(),
    ...fields,
  });
  [
    booking(students[0].email, manilaWeekdayAt(now, -7, 10), {
      status: 'COMPLETED',
      lessonId: lessons[0].id,
      topic: 'Small talk',
      feedback: 'Great progress! Practise past-tense verbs for next time.',
      privateNote: 'Push for longer answers.',
    }),
    booking(students[0].email, manilaWeekdayAt(now, 2, 10), { topic: 'Business emails' }),
    booking(students[1].email, manilaWeekdayAt(now, 3, 15), { lessonId: lessons[0].id, studentNote: 'First class!' }),
    booking(students[2].email, manilaWeekdayAt(now, 5, 16), { lessonId: lessons[1].id, topic: 'Interview prep' }),
  ].forEach(db.insertBooking);

  console.log(`Seeded ${students.length} demo students, ${lessons.length} lessons and 4 bookings.`);
}
