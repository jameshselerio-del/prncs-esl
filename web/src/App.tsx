import { useEffect, useState } from 'react';
import { HashRouter, Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import type { MeResult } from '../../shared/api';
import { useApi, useQuery } from './api';
import { APP_NAME, useAuth } from './auth';
import { BRAND, LoadingScreen, Logo, SiteFooter } from './brand';
import { ErrorText } from './components/Bits';
import { AccountMenu } from './components/AccountMenu';
import { PrivacyLink, TermsLink } from './components/LegalLinks';
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
];
const TEACHER_NAV = [
  { to: '/', label: 'Bookings' },
  { to: '/availability', label: 'Availability' },
  { to: '/lessons', label: 'Lessons' },
  { to: '/students', label: 'Students' },
];

// HashRouter: GitHub Pages serves static files only, so deep links must live after the '#'.
export function App() {
  const me = useQuery('me');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (me.error) return <ErrorText error={me.error} />;
  if (!me.data) return <LoadingScreen />;
  if (!me.data.registered) return <Register me={me.data} onDone={me.reload} />;

  const session: Session = {
    user: me.data.user,
    settings: me.data.settings,
    username: me.data.username,
    now,
    refresh: me.reload,
  };
  const isTeacher = session.user.role === 'ADMIN';
  const nav = isTeacher ? TEACHER_NAV : STUDENT_NAV;

  return (
    <SessionContext.Provider value={session}>
      <HashRouter>
        <header className="topbar">
          <Link to="/" className="logo-link" aria-label={`${BRAND.name} home`}>
            <Logo />
          </Link>
          <nav aria-label="Main">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <AccountMenu />
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
        <SiteFooter />
      </HashRouter>
    </SessionContext.Provider>
  );
}

function Register({ me, onDone }: { me: Extract<MeResult, { registered: false }>; onDone: () => void }) {
  const api = useApi();
  const { signOut } = useAuth();
  return (
    <>
      <main className="page narrow">
        <Logo />
        <h1>Welcome to {APP_NAME}</h1>
        <p>
          Tell us a little about yourself to start booking classes ·{' '}
          <span className="ja" lang="ja">
            ようこそ
          </span>
        </p>
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
          By creating an account you agree to the <TermsLink /> and <PrivacyLink />.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
