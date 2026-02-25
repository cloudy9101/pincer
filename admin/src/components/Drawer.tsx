import { NavLink } from 'react-router';

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/agents', label: 'Agents' },
  { to: '/skills', label: 'Skills' },
  { to: '/sessions', label: 'Sessions' },
  { to: '/allowlist', label: 'Allowlist' },
  { to: '/settings', label: 'Settings' },
];

interface DrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function Drawer({ open, onClose }: DrawerProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-30 md:hidden"
        onClick={onClose}
      />
      {/* Drawer panel */}
      <div className="fixed inset-y-0 left-0 w-64 bg-gray-900 text-white z-40 flex flex-col md:hidden">
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
          <span className="text-base font-semibold">Pincer Admin</span>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="p-1 rounded-md text-gray-300 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
          {links.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                `block px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
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
      </div>
    </>
  );
}
