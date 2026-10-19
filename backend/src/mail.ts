import { buildIcs, type ClassEvent } from '../../shared/ics';
import { appUrl } from './config';
import type { Booking, Settings, User } from '../../shared/types';
import { hasEmail } from '../../shared/validation';

/** e.g. "Mon, Oct 26, 2026, 9:00 AM (Asia/Tokyo)" in the recipient's time zone. */
function when(b: Booking, timeZone: string): string {
  const start = Utilities.formatDate(new Date(b.start), timeZone, 'EEE, MMM d, yyyy, h:mm a');
  const end = Utilities.formatDate(new Date(b.end), timeZone, 'h:mm a');
  return `${start} – ${end} (${timeZone})`;
}

/** Who an account email goes to; `name` is empty before a password sign-up completes the profile. */
type Recipient = Pick<User, 'email' | 'name'>;

const greeting = (r: Recipient): string => (r.name ? `Hi ${r.name},` : 'Hi,');

function send(
  to: string,
  subject: string,
  lines: string[],
  settings: Settings,
  attachments: GoogleAppsScript.Base.BlobSource[] = [],
): void {
  // Students without email (and staging demo students) have undeliverable .invalid addresses.
  if (!to || !hasEmail(to)) return;
  try {
    MailApp.sendEmail({
      to,
      subject: `[${settings.schoolName}] ${subject}`,
      body: [...lines, '', appUrl()].join('\n'),
      attachments,
    });
  } catch (err) {
    // A failed notification (e.g. daily quota reached) must not roll back the booking itself.
    console.error('Email failed', err);
  }
}

/**
 * A calendar file for one booking. The UID is stable per booking, so the cancellation
 * (sequence 1) replaces the original event (sequence 0) in the recipient's calendar.
 * Students get an invitation from the teacher; the teacher's own copy is a plain event.
 */
function calendarFile(
  b: Booking,
  student: User,
  teacher: User | undefined,
  settings: Settings,
  forTeacher: boolean,
  cancelled: boolean,
): GoogleAppsScript.Base.BlobSource {
  const event: ClassEvent = {
    uid: `${b.id}@prncs-esl`,
    start: b.start,
    end: b.end,
    summary: forTeacher ? `English class: ${student.name}` : `${settings.schoolName}: English class`,
    description: [
      b.topic ? `Topic: ${b.topic}` : '',
      b.meetingLink ? `Join: ${b.meetingLink}` : 'The meeting link will appear in the app before class.',
      appUrl() ? `Details: ${appUrl()}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    url: b.meetingLink,
    organizer: teacher ? { name: teacher.name, email: teacher.email } : null,
    attendee: forTeacher ? null : { name: student.name, email: student.email },
    method: cancelled ? 'CANCEL' : forTeacher ? 'PUBLISH' : 'REQUEST',
    sequence: cancelled ? 1 : 0,
  };
  return Utilities.newBlob(
    buildIcs(event, new Date()),
    `text/calendar; charset=utf-8; method=${event.method}`,
    cancelled ? 'cancelled-class.ics' : 'class.ics',
  );
}

export const notify = {
  /** `byTeacher`: the teacher booked it for the student, so only the student is told. */
  booked(b: Booking, student: User, teacher: User | undefined, settings: Settings, byTeacher = false): void {
    send(
      student.email,
      byTeacher ? 'Your teacher booked a class for you' : 'Your class is booked',
      [
        `Hi ${student.name},`,
        '',
        byTeacher
          ? `Your teacher booked a class for you on ${when(b, student.timeZone)}.`
          : `Your class is confirmed for ${when(b, student.timeZone)}.`,
        b.meetingLink ? `Meeting link: ${b.meetingLink}` : 'The meeting link will appear in the app before class.',
        `You can cancel up to ${settings.cancelNoticeHours} hours before the class.`,
        'Open the attached calendar file to add the class to your calendar.',
      ],
      settings,
      [calendarFile(b, student, teacher, settings, false, false)],
    );
    if (teacher && !byTeacher) {
      send(
        teacher.email,
        `New booking: ${student.name}`,
        [
          `${student.name} (${student.email}) booked ${when(b, teacher.timeZone)}.`,
          b.topic ? `Topic: ${b.topic}` : '',
          b.studentNote ? `Note: ${b.studentNote}` : '',
        ].filter(Boolean),
        settings,
        [calendarFile(b, student, teacher, settings, true, false)],
      );
    }
  },

  /** Both sides get a cancellation file, so the event disappears from their calendars. */
  cancelled(b: Booking, student: User, teacher: User | undefined, byTeacher: boolean, settings: Settings): void {
    const reason = b.cancelReason ? `Reason: ${b.cancelReason}` : '';
    send(
      student.email,
      byTeacher ? 'Your class was cancelled' : 'You cancelled a class',
      [
        `Hi ${student.name},`,
        '',
        byTeacher
          ? `Your teacher cancelled the class on ${when(b, student.timeZone)}.`
          : `You cancelled your class on ${when(b, student.timeZone)}.`,
        reason,
        'Please book another time in the app.',
      ].filter(Boolean),
      settings,
      [calendarFile(b, student, teacher, settings, false, true)],
    );
    if (teacher && !byTeacher) {
      send(
        teacher.email,
        `Cancelled: ${student.name}`,
        [`${student.name} cancelled the class on ${when(b, teacher.timeZone)}.`, reason].filter(Boolean),
        settings,
        [calendarFile(b, student, teacher, settings, true, true)],
      );
    }
  },

  reminder(b: Booking, student: User, settings: Settings): void {
    send(
      student.email,
      'Reminder: class tomorrow',
      [
        `Hi ${student.name},`,
        '',
        `This is a reminder of your class on ${when(b, student.timeZone)}.`,
        b.meetingLink ? `Meeting link: ${b.meetingLink}` : '',
        b.topic ? `Topic: ${b.topic}` : '',
      ].filter(Boolean),
      settings,
    );
  },

  passwordResetCode(user: Recipient, code: string, settings: Settings): void {
    send(
      user.email,
      'Your password reset code',
      [
        greeting(user),
        '',
        `Your code to reset your password is ${code}. It expires in 15 minutes.`,
        "If you didn't ask to reset your password, you can ignore this email.",
      ],
      settings,
    );
  },

  /** Sent whenever a password is set, changed or reset, so an unexpected change gets noticed. */
  passwordChanged(user: Recipient, username: string, firstTime: boolean, settings: Settings): void {
    send(
      user.email,
      firstTime ? 'Password sign-in turned on' : 'Your password was changed',
      [
        greeting(user),
        '',
        firstTime
          ? `You can now sign in with the username "${username}" and your password.`
          : `The password for your username "${username}" was just changed.`,
        'If this wasn\'t you, use "Forgot password?" on the sign-in page to set a new one, and tell your teacher.',
      ],
      settings,
    );
  },

  signUpCode(email: string, code: string, settings: Settings): void {
    send(
      email,
      'Confirm your email',
      [
        'Hi,',
        '',
        `Your code to finish creating your account is ${code}. It expires in 15 minutes.`,
        "If you didn't sign up, you can ignore this email.",
      ],
      settings,
    );
  },

  /** Someone tried to sign up with an address that already has an account; tell the owner, not the visitor. */
  alreadyRegistered(email: string, settings: Settings): void {
    send(
      email,
      'You already have an account',
      [
        'Hi,',
        '',
        'Someone (probably you) tried to create an account with this email address, but it already has a username and password.',
        'Sign in with them, or use "Forgot password?" on the sign-in page.',
        "If this wasn't you, you can ignore this email.",
      ],
      settings,
    );
  },

  /** The teacher created the account; the password is given in person, never emailed. */
  accountCreated(user: Recipient, username: string, settings: Settings): void {
    send(
      user.email,
      'Your account is ready',
      [
        greeting(user),
        '',
        `Your teacher created an account for you. Your username is "${username}".`,
        'Your teacher will give you your password. You can change it later on your Profile page.',
      ],
      settings,
    );
  },

  passwordSetByTeacher(user: Recipient, username: string, settings: Settings): void {
    send(
      user.email,
      'Your teacher set a new password',
      [
        greeting(user),
        '',
        `Your teacher set a new password for your username "${username}". Ask your teacher for it.`,
        'You can change it later on your Profile page.',
      ],
      settings,
    );
  },
};
