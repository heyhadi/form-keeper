import { StrictMode, useEffect, useState, type MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';

/** A tiny pushState router, so navigations happen without a page load. */
function usePath(): [string, (path: string) => void] {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = (next: string) => {
    history.pushState(null, '', next);
    setPath(next);
  };
  return [path, navigate];
}

function UserForm({ id }: { id: string }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('viewer');
  return (
    <form id="user">
      <h2>Edit user {id}</h2>
      <label>Name <input name="name" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Role
        <select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="viewer">Viewer</option>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <output data-testid="state">{JSON.stringify({ name, role })}</output>
    </form>
  );
}

function App() {
  const [path, navigate] = usePath();
  const id = /^\/spa\/users\/(\w+)\/edit$/.exec(path)?.[1];
  const link = (to: string, label: string) => (
    <a
      href={to}
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        navigate(to);
      }}
    >
      {label}
    </a>
  );
  return (
    <>
      <nav style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        {link('/spa/users/1/edit', 'User 1')}
        {link('/spa/users/2/edit', 'User 2')}
        {link('/spa/about', 'About (no form)')}
      </nav>
      {id ? <UserForm key={id} id={id} /> : <p>No form on this route.</p>}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
