// Demo data for the mock backend, relative to the backend's current time.
import { mockToken } from './backend.mjs';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MANILA_OFFSET = 8 * HOUR;

export const TEACHER = { email: 'teacher@example.com', name: 'Ms. Ana Reyes', timeZone: 'Asia/Manila' };
export const STUDENTS = [
  {
    email: 'yuki@example.com',
    name: 'Yuki Tanaka',
    timeZone: 'Asia/Tokyo',
    level: 'INTERMEDIATE',
    nativeLanguage: 'Japanese',
  },
  {
    email: 'minh@example.com',
    name: 'Minh Nguyen',
    timeZone: 'Asia/Ho_Chi_Minh',
    level: 'BEGINNER',
    nativeLanguage: 'Vietnamese',
  },
  {
    email: 'sofia@example.com',
    name: 'Sofía García',
    timeZone: 'Europe/Madrid',
    level: 'ADVANCED',
    nativeLanguage: 'Spanish',
  },
];

/** Identities offered by the dev identity switcher. */
export const IDENTITIES = [
  { label: `${TEACHER.name} (teacher)`, token: mockToken(TEACHER.email, TEACHER.name) },
  ...STUDENTS.map((s) => ({ label: `${s.name} (student)`, token: mockToken(s.email, s.name) })),
  { label: 'New student (not registered)', token: mockToken('new.student@example.com', 'Nora New') },
];

export const LESSONS = [
  {
    id: 'lesson-small-talk',
    title: 'Small talk at work',
    level: 'ELEMENTARY',
    summary: 'Greetings, weekend plans and polite follow-up questions.',
    content: 'Warm-up: describe your weekend in three sentences.\n\nRole-play: meeting a new colleague.',
    materialsUrl: 'https://example.com/materials/small-talk.pdf',
  },
  {
    id: 'lesson-interviews',
    title: 'Job interview practice',
    level: 'UPPER_INTERMEDIATE',
    summary: 'Answering common interview questions with the STAR method.',
    content: 'Tell me about yourself.\n\nDescribe a challenge you solved at work.',
    materialsUrl: '',
  },
];

/** UTC instant of `hour`:00 Manila time on the first weekday at least `days` days from `now`. */
function manilaWeekdayAt(now, days, hour) {
  const date = new Date(now + days * DAY + MANILA_OFFSET);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setTime(date.getTime() + DAY);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour) - MANILA_OFFSET);
}

function booking(id, student, start, fields = {}) {
  return {
    id,
    studentEmail: student.email,
    start: start.toISOString(),
    end: new Date(start.getTime() + 50 * 60_000).toISOString(),
    status: 'CONFIRMED',
    meetingLink: 'https://meet.example.com/ana-reyes',
    createdAt: new Date(start.getTime() - 7 * DAY).toISOString(),
    ...fields,
  };
}

/** Creates the database and fills it with a teacher, students, schedule, lessons and bookings. */
export function seed(backend) {
  backend.setupDatabase();
  const now = backend.clock.now();
  const createdAt = new Date(now - 30 * DAY).toISOString();
  const [yuki, minh, sofia] = STUDENTS;

  backend.insert('Users', [
    { ...TEACHER, role: 'ADMIN', active: 'TRUE', contact: 'LINE: ana.teaches', createdAt },
    ...STUDENTS.map((s) => ({ ...s, role: 'STUDENT', active: 'TRUE', goals: 'Speak more confidently.', createdAt })),
  ]);

  // Weekdays 09:00–12:00 and 14:00–18:00 Manila time.
  backend.insert(
    'Availability',
    [1, 2, 3, 4, 5].flatMap((weekday) => [
      { id: `rule-${weekday}-am`, weekday: String(weekday), start: '09:00', end: '12:00' },
      { id: `rule-${weekday}-pm`, weekday: String(weekday), start: '14:00', end: '18:00' },
    ]),
  );

  backend.insert(
    'Settings',
    Object.entries({
      schoolName: 'Komorebi English (mock)',
      defaultMeetingLink: 'https://meet.example.com/ana-reyes',
    }).map(([key, value]) => ({ key, value })),
  );

  backend.insert(
    'Lessons',
    LESSONS.map((l) => ({ ...l, createdAt })),
  );

  backend.insert('Bookings', [
    booking('booking-yuki-past', yuki, manilaWeekdayAt(now, -7, 10), {
      status: 'COMPLETED',
      lessonId: 'lesson-small-talk',
      topic: 'Small talk',
      feedback: 'Great progress! Practise past-tense verbs for next time.',
      privateNote: 'Tends to avoid follow-up questions; push for longer answers.',
      reminderSentAt: new Date(now - 8 * DAY).toISOString(),
    }),
    booking('booking-yuki-next', yuki, manilaWeekdayAt(now, 2, 10), { topic: 'Business emails' }),
    booking('booking-minh-next', minh, manilaWeekdayAt(now, 3, 15), {
      lessonId: 'lesson-small-talk',
      studentNote: 'First class, a bit nervous!',
    }),
    booking('booking-sofia-next', sofia, manilaWeekdayAt(now, 5, 16), {
      lessonId: 'lesson-interviews',
      topic: 'Interview next month',
    }),
  ]);

  // A read update for Yuki and an unread one for the teacher, so the bell has something to show.
  const bookings = backend.sheet('Bookings').records();
  const startOf = (id) => bookings.find((b) => b.id === id).start;
  backend.insert('Notifications', [
    {
      id: 'note-yuki-feedback',
      email: yuki.email,
      kind: 'FEEDBACK_ADDED',
      bookingId: 'booking-yuki-past',
      classStart: startOf('booking-yuki-past'),
      createdAt: new Date(now - 6 * DAY).toISOString(),
      readAt: new Date(now - 5 * DAY).toISOString(),
    },
    {
      id: 'note-teacher-sofia',
      email: TEACHER.email,
      kind: 'NEW_BOOKING',
      bookingId: 'booking-sofia-next',
      classStart: startOf('booking-sofia-next'),
      actorName: sofia.name,
      detail: 'Interview next month',
      createdAt: new Date(now - 2 * HOUR).toISOString(),
    },
  ]);
}
