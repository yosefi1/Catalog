import { NavLink, Outlet } from 'react-router-dom';

export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__mark">EQ</span>
          <div>
            <strong>Equipment Catalog</strong>
            <p>Offline lab inventory</p>
          </div>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Main">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
          <span>Inventory</span>
        </NavLink>
        <NavLink
          to="/devices/new"
          className={({ isActive }) => `nav-add ${isActive ? 'is-active' : ''}`}
        >
          <span>+ Add</span>
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => (isActive ? 'is-active' : '')}
        >
          <span>Data</span>
        </NavLink>
      </nav>
    </div>
  );
}
