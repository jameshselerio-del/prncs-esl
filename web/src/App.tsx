import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useQuery } from './api';
import { useAuth } from './auth';
import { Approvals } from './pages/Approvals';
import { Dashboard } from './pages/Dashboard';
import { NewRequest } from './pages/NewRequest';

// HashRouter: GitHub Pages serves static files only, so deep links must live after the '#'.
export function App() {
  const { signOut } = useAuth();
  const me = useQuery('me');

  if (me.error) return <p className="error page">{me.error}</p>;
  if (!me.data) return <p className="page">Loading…</p>;

  return (
    <HashRouter>
      <header className="topbar">
        <strong>PRNCS Leaves</strong>
        <nav>
          <NavLink to="/" end>
            My leaves
          </NavLink>
          <NavLink to="/new">File a leave</NavLink>
          {me.data.isApprover && <NavLink to="/approvals">Approvals</NavLink>}
        </nav>
        <span className="who">
          {me.data.user.name} · {me.data.user.office}
          <button type="button" className="link" onClick={() => signOut()}>
            Sign out
          </button>
        </span>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<Dashboard me={me.data} onChange={me.reload} />} />
          <Route path="/new" element={<NewRequest me={me.data} onCreated={me.reload} />} />
          {me.data.isApprover && <Route path="/approvals" element={<Approvals />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </HashRouter>
  );
}
