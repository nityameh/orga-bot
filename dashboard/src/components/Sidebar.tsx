'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/dashboard', label: 'Home', icon: '□' },
  { href: '/dashboard/notes', label: 'Notes', icon: '▤' },
  { href: '/dashboard/tasks', label: 'Tasks', icon: '☑' },
  { href: '/dashboard/reminders', label: 'Reminders', icon: '◔' },
  { href: '/dashboard/clients', label: 'Clients', icon: '◉' },
];

export default function Sidebar() {
  const pathname = usePathname();

  const handleLogout = () => {
    localStorage.removeItem('orga_phone');
    window.location.href = '/login';
  };

  return (
    <aside className="w-56 h-screen bg-white border-r border-gray-200 flex flex-col justify-between p-4 shrink-0">
      <div>
        <h1 className="text-lg font-bold text-gray-900 mb-8 px-3">Orga</h1>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-gray-100 text-gray-900 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <button
        onClick={handleLogout}
        className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors text-left"
      >
        Log out
      </button>
    </aside>
  );
}
