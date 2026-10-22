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
- **Username and password:** visitors can also sign up with an email, username
  and password; a code emailed to the address confirms it before the account is
  created, then they complete the same profile. Google users can add a username
  and password on their Profile page (or through sign-up) and sign in either
  way. The teacher can also add a student as a row in the Users tab; that
  student then signs up with the same email to set their username and password. Passwords can be
  changed (with the current one) and a forgotten one reset with an emailed code.
- **Google is optional:** the sign-in page leads with username and password and
  "Create an account"; "Continue with Google" is an extra option below. For
  students who aren't comfortable with Google or email, the teacher can **add a
  student** on the Students page (name, optional email, username, password,
  time zone, level) and later **reset their password**. A page then shows the
  website, username and password to hand over. Students without email get no
  class emails and can't use "Forgot password?" (they ask the teacher instead).
- The teacher is the Users row with role `ADMIN`. The teacher can deactivate a
  student, which blocks sign-in and booking.

## Student features

| Page        | Contents                                                                                                                                                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home        | Next class (time, lesson, contents, meeting link, materials), upcoming classes, recent classes with teacher feedback, lesson library                                                                                                                                                     |
| Book        | Open times in the student's time zone as a day list or a month calendar; pick one or more times (overlapping ones are blocked), choose a lesson for each or let the teacher choose, add an optional topic/note, and book them together. Students stay on the page and see a confirmation |
| My bookings | Upcoming, past and cancelled bookings in **table**, **calendar** (month) and **timeline** views; cancel within policy                                                                                                                                                                    |
| Profile     | Name, time zone, English level, native language, learning goals, contact; email is read-only                                                                                                                                                                                             |

## Translation hints

Many students are beginners, so student-facing pages show short **Japanese** or
**Traditional Chinese (Taiwan)** translations under key English labels, buttons
and headings, and an ⓘ button that opens a longer translation of explanations
(booking rules, how to pick times, sign-up and password reset). Each viewer
picks 日本語, 繁體中文 or Off in the account menu or on the sign-in page; the
choice is saved in the browser (default Japanese, or Chinese when the browser
is set to Chinese). The existing bilingual brand text (e.g. "Book class ·
予約確定") is separate and always shown. Teacher-only pages have no hints.

## Teacher features

| Page          | Contents                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bookings      | All bookings in table, calendar and timeline views with student names; filter by status/student; export CSV                                                                           |
| Booking edit  | Assign a lesson, topic, meeting link, materials, feedback (visible to student) and a private note; mark completed/no-show; cancel                                                     |
| Availability  | Weekly hours (several ranges per day), time off (date ranges), booking settings                                                                                                       |
| Lessons       | Lesson library: title, level, summary, contents, materials link                                                                                                                       |
| Students      | List with profile details and booking counts; activate/deactivate                                                                                                                     |
| Announcements | Write a title and message (with `{first name}` / `{name}` filled in per student), send to all active students or chosen ones, by email and/or the bell; history of sent announcements |

**Announcements** reach students in their notification bell and on an
Announcements page (account menu); with "Also send by email" ticked, students
with an address are emailed too. Before sending, the server checks Google's
daily email allowance and refuses (sending nothing) if the announcement would
exceed it, so the teacher can send it app-only or to fewer students.

## Booking rules (enforced server-side)

- Several classes can be booked in one go (up to 10, `bookClasses`). It's all
  or nothing: each time is re-checked as if the earlier ones were booked, so
  overlapping choices and the per-student limit are enforced across the set.

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

## Notifications (in the app)

A bell beside the account menu shows an unread count and a panel with:

- **Updates** (kept 30 days, read/unread, "Mark all as read"): for students,
  the teacher booked or cancelled their class, added feedback, or added a new
  meeting link to an upcoming class; for the teacher, a student booked or
  cancelled. Clicking one opens My bookings (student) or Bookings (teacher).
- **To do** (worked out each time, never stored): a class starting within 15
  minutes (with a Join link), past classes the teacher hasn't marked
  completed/no-show, and setup suggestions (username and password, English
  level) that can be dismissed with "Not now".

The server can't push to the page, so the bell refreshes on load, when the tab
becomes visible again, when it is opened, and every 3 minutes.

## Non-functional

- Static hosting (GitHub Pages); data in a Google Sheet in the teacher's Drive;
  Google Apps Script backend; Google Sign-In.
- No payments.
