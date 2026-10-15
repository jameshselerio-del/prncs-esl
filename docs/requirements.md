# Requirements — ESL Class Booking

## Scope

A booking site where students book one-to-one ESL classes with a single
teacher. The teacher publishes weekly availability; students book open slots,
see their lessons and manage their profile.

## Roles

| Role    | Who                 | Can do                                                                                                        |
| ------- | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Admin   | The teacher         | Manage availability, time off and booking settings; view and manage all bookings; manage lessons and students |
| Student | Anyone who signs up | Book classes, view availability, view and cancel own bookings, view lesson details, manage own profile        |

- **Sign-up is open:** anyone with a Google account can sign in. On first sign-in
  they complete a short profile and become a Student.
- The teacher is the Users row with role `ADMIN`. The teacher can deactivate a
  student, which blocks sign-in and booking.

## Student features

| Page        | Contents                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Home        | Next class (time, lesson, contents, meeting link, materials), upcoming classes, recent classes with teacher feedback, lesson library |
| Book        | Available slots for the booking window, grouped by day in the student's time zone; book with an optional topic/note                  |
| My bookings | Upcoming, past and cancelled bookings in **table**, **calendar** (month) and **timeline** views; cancel within policy                |
| Profile     | Name, time zone, English level, native language, learning goals, contact; email is read-only                                         |

## Teacher features

| Page         | Contents                                                                                                                          |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Bookings     | All bookings in table, calendar and timeline views with student names; filter by status/student; export CSV                       |
| Booking edit | Assign a lesson, topic, meeting link, materials, feedback (visible to student) and a private note; mark completed/no-show; cancel |
| Availability | Weekly hours (several ranges per day), time off (date ranges), booking settings                                                   |
| Lessons      | Lesson library: title, level, summary, contents, materials link                                                                   |
| Students     | List with profile details and booking counts; activate/deactivate                                                                 |

## Booking rules (enforced server-side)

- Teacher hours are set in **Asia/Manila** (UTC+8, no daylight saving). All
  booking times are stored in UTC and shown in each viewer's time zone.
- A slot is bookable when it:
  - fits entirely inside a weekly availability range,
  - is not on a time-off date (Manila date),
  - does not overlap a confirmed or completed booking,
  - starts at least **min notice** from now and within the **booking window**.
- Slots start every **slot step** minutes and last **lesson length** minutes.
- Booking is **instant** (status `CONFIRMED`).
- A student can hold at most **max upcoming** confirmed bookings.
- Students can cancel their own confirmed bookings up to **cancel notice**
  hours before the start. The teacher can cancel any upcoming booking.
- The teacher can mark past confirmed bookings `COMPLETED` or `NO_SHOW`.

| Setting        | Default    |
| -------------- | ---------- |
| Lesson length  | 50 minutes |
| Slot step      | 30 minutes |
| Min notice     | 12 hours   |
| Booking window | 30 days    |
| Cancel notice  | 24 hours   |
| Max upcoming   | 5          |

## Notifications (email)

| Event                   | Recipients                      | Calendar file (.ics)                |
| ----------------------- | ------------------------------- | ----------------------------------- |
| Class booked by student | Student (confirmation), teacher | Invite to student, event to teacher |
| Class booked by teacher | Student                         | Invite to student                   |
| Cancelled by student    | Student (confirmation), teacher | Cancellation to both                |
| Cancelled by teacher    | Student                         | Cancellation to student             |
| Reminder (~24 h before) | Student                         | —                                   |

Calendar files use a stable UID per booking, so a cancellation removes the
event that the original invite added. Changes made later in the app (for
example a new meeting link) are not re-sent as calendar updates.

## Non-functional

- Static hosting (GitHub Pages); data in a Google Sheet in the teacher's Drive;
  Google Apps Script backend; Google Sign-In.
- No payments.
