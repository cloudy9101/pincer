interface MobileHeaderProps {
  onMenuOpen: () => void;
}

export default function MobileHeader({ onMenuOpen }: MobileHeaderProps) {
  return (
    <header className="md:hidden flex items-center justify-between bg-gray-900 text-white px-4 py-3 sticky top-0 z-20">
      <span className="text-base font-semibold">Pincer Admin</span>
      <button
        onClick={onMenuOpen}
        aria-label="Open menu"
        className="p-2 rounded-md text-gray-300 hover:text-white hover:bg-gray-700"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
    </header>
  );
}
