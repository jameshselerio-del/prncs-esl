import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import type { MeResult } from '../../shared/api';
import { useApi, useQuery } from './api';
import { APP_NAME, useAuth } from './auth';
import { ErrorText } from './components/Bits';
import { PrivacyLink } from './components/PrivacyLink';
import { ProfileForm } from './components/ProfileForm';
import { Profile } from './pages/Profile';
import { Book } from './pages/student/Book';
import { Home } from './pages/student/Home';
import { MyBookings } from './pages/student/MyBookings';
import { Availability } from './pages/teacher/Availability';
import { Lessons } from './pages/teacher/Lessons';
import { Students } from './pages/teacher/Students';
import { TeacherBookings } from './pages/teacher/TeacherBookings';
import { SessionContext, type Session } from './session';
import { browserTimeZone } from './time';

const STUDENT_NAV = [
  { to: '/', label: 'Home' },
  { to: '/book', label: 'Book a class' },
  { to: '/bookings', label: 'My bookings' },
  { to: '/profile', label: 'Profile' },
];
const TEACHER_NAV = [
  { to: '/', label: 'Bookings' },
  { to: '/availability', label: 'Availability' },
  { to: '/lessons', label: 'Lessons' },
  { to: '/students', label: 'Students' },
  { to: '/profile', label: 'Profile' },
];

// HashRouter: GitHub Pages serves static files only, so deep links must live after the '#'.
export function App() {
  const { signOut } = useAuth();
  const me = useQuery('me');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (me.error) return <ErrorText error={me.error} />;
  if (!me.data) return <p className="page">Loading…</p>;
  if (!me.data.registered) return <Register me={me.data} onDone={me.reload} />;

  const session: Session = {
    user: me.data.user,
    settings: me.data.settings,
    now,
    refresh: me.reload,
  };
  const isTeacher = session.user.role === 'ADMIN';
  const nav = isTeacher ? TEACHER_NAV : STUDENT_NAV;

  return (
    <SessionContext.Provider value={session}>
      <HashRouter>
        <header className="topbar">
          <strong className="brand">{session.settings.schoolName || APP_NAME}</strong>
          <nav aria-label="Main">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <span className="who">
            {session.user.name}
            {isTeacher && <span className="tag">Teacher</span>}
            <button type="button" className="link" onClick={() => signOut()}>
              Sign out
            </button>
          </span>
        </header>
        <main className="page">
          <Routes>
            {isTeacher ? (
              <>
                <Route path="/" element={<TeacherBookings />} />
                <Route path="/availability" element={<Availability />} />
                <Route path="/lessons" element={<Lessons />} />
                <Route path="/students" element={<Students />} />
              </>
            ) : (
              <>
                <Route path="/" element={<Home />} />
                <Route path="/book" element={<Book />} />
                <Route path="/bookings" element={<MyBookings />} />
              </>
            )}
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <footer className="footer">
          <PrivacyLink />
        </footer>
      </HashRouter>
    </SessionContext.Provider>
  );
}

function Register({ me, onDone }: { me: Extract<MeResult, { registered: false }>; onDone: () => void }) {
  const api = useApi();
  const { signOut } = useAuth();
  return (
    <main className="page narrow">
      <h1>Welcome to {me.settings.schoolName || APP_NAME}</h1>
      <p>Tell us a little about yourself to start booking classes.</p>
      <ProfileForm
        initial={{
          name: me.suggestedName,
          timeZone: browserTimeZone(),
          level: '',
          nativeLanguage: '',
          goals: '',
          contact: '',
        }}
        email={me.email}
        submitLabel="Create my account"
        onSubmit={async (profile) => {
          await api('register', profile);
          onDone();
        }}
      />
      <p className="hint">
        Not you?{' '}
        <button type="button" className="link" onClick={() => signOut()}>
          Use another account
        </button>
      </p>
      <p className="hint">
        How we use your information: <PrivacyLink />
      </p>
    </main>
  );
}
