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

function send(to: string, subject: string, lines: string[], settings: Settings): void {
  if (!to) return;
  try {
    MailApp.sendEmail({
      to,
      subject: `[${settings.schoolName}] ${subject}`,
      body: [...lines, '', appUrl()].join('\n'),
    });
  } catch (err) {
    // A failed notification (e.g. daily quota reached) must not roll back the booking itself.
    console.error('Email failed', err);
  }
}

export const notify = {
  booked(b: Booking, student: User, teacher: User | undefined, settings: Settings): void {
    send(
      student.email,
      'Your class is booked',
      [
        `Hi ${student.name},`,
        '',
        `Your class is confirmed for ${when(b, student.timeZone)}.`,
        b.meetingLink ? `Meeting link: ${b.meetingLink}` : 'The meeting link will appear in the app before class.',
        `You can cancel up to ${settings.cancelNoticeHours} hours before the class.`,
      ],
      settings,
    );
    if (teacher) {
      send(
        teacher.email,
        `New booking: ${student.name}`,
        [
          `${student.name} (${student.email}) booked ${when(b, teacher.timeZone)}.`,
          b.topic ? `Topic: ${b.topic}` : '',
          b.studentNote ? `Note: ${b.studentNote}` : '',
        ].filter(Boolean),
        settings,
      );
    }
  },

  cancelled(b: Booking, student: User, teacher: User | undefined, byTeacher: boolean, settings: Settings): void {
    const reason = b.cancelReason ? `Reason: ${b.cancelReason}` : '';
    if (byTeacher) {
      send(
        student.email,
        'Your class was cancelled',
        [
          `Hi ${student.name},`,
          '',
          `Your teacher cancelled the class on ${when(b, student.timeZone)}.`,
          reason,
          'Please book another time in the app.',
        ].filter(Boolean),
        settings,
      );
    } else if (teacher) {
      send(
        teacher.email,
        `Cancelled: ${student.name}`,
        [`${student.name} cancelled the class on ${when(b, teacher.timeZone)}.`, reason].filter(Boolean),
        settings,
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
