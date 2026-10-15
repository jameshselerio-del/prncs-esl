import { buildIcs, type ClassEvent } from '../../shared/ics';
import { DEMO_DOMAIN } from './demo';
import type { Booking, Settings, User } from '../../shared/types';

function appUrl(): string {
  return PropertiesService.getScriptProperties().getProperty('APP_URL') ?? '';
}

/** e.g. "Mon, Oct 26, 2026, 9:00 AM (Asia/Tokyo)" in the recipient's time zone. */
function when(b: Booking, timeZone: string): string {
  const start = Utilities.formatDate(new Date(b.start), timeZone, 'EEE, MMM d, yyyy, h:mm a');
  const end = Utilities.formatDate(new Date(b.end), timeZone, 'h:mm a');
  return `${start} – ${end} (${timeZone})`;
}

function send(
  to: string,
  subject: string,
  lines: string[],
  settings: Settings,
  attachments: GoogleAppsScript.Base.BlobSource[] = [],
): void {
  // Staging demo students have undeliverable .invalid addresses; never email them.
  if (!to || to.endsWith(DEMO_DOMAIN)) return;
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
};
