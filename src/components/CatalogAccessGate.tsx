import { Navigate, Outlet } from 'react-router-dom';
import { getAccessKey, hasAccessKey, setAccessKey } from '../services/accessKey';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

export function CatalogAccessGate() {
  const [ready, setReady] = useState(false);
  const [key, setKey] = useState('');

  useEffect(() => {
    setKey(getAccessKey());
    setReady(true);
  }, []);

  if (!ready) return null;

  if (!hasAccessKey()) {
    return (
      <div className="page access-gate">
        <h1>Connect to server</h1>
        <p className="muted">
          The catalog now loads from the server (Supabase + file storage). Enter the access key from
          Vercel — the same value as <code>CATALOG_ACCESS_KEY</code>.
        </p>
        <label className="field">
          <span className="field__label">Access key</span>
          <input
            className="field__input"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Catalog access key"
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          className="btn btn--primary btn--large"
          disabled={!key.trim()}
          onClick={() => {
            setAccessKey(key);
            window.location.href = '/';
          }}
        >
          Connect
        </button>
        <p className="muted small">
          Had data only on this device? Go to <Link to="/settings">Settings</Link> to upload local
          data to the server.
        </p>
      </div>
    );
  }

  return <Outlet />;
}

export function CatalogAccessRedirect() {
  if (hasAccessKey()) return <Navigate to="/" replace />;
  return <Navigate to="/settings" replace />;
}
