import { useState } from 'react';
import { Outlet } from 'react-router';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import Drawer from './Drawer';

export default function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader onMenuOpen={() => setDrawerOpen(true)} />
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
