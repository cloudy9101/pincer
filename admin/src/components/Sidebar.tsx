import { NavLink } from 'react-router';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/agents', label: 'Agents' },
  { to: '/skills', label: 'Skills' },
  { to: '/catalog', label: 'Catalog' },
  { to: '/sessions', label: 'Sessions' },
  { to: '/allowlist', label: 'Allowlist' },
  { to: '/settings', label: 'Settings' },
];

export default function Sidebar() {
  return (
    <aside className="hidden md:flex md:flex-col w-56 bg-gray-900 text-white min-h-screen shrink-0">
      <div className="px-4 py-5 border-b border-gray-700">
        <span className="text-lg font-semibold tracking-tight">Pincer Admin</span>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-1">
        {links.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
