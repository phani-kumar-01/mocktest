import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';

interface ShellProps {
  user: { username?: string; name: string };
  children: React.ReactNode;
}

export default function AdminShell({ user, children }: ShellProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await api.post('/auth/logout');
    navigate('/admin/login');
    window.location.reload();
  };

  const navItems = [
    { to: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/admin/exams', label: 'Exams & Schedule', icon: '📝' },
    { to: '/admin/monitor', label: 'Live Monitor', icon: '📡' },
    { to: '/admin/results', label: 'Results & Analytics', icon: '🏆' },
    { to: '/admin/mail', label: 'Email & Reports', icon: '✉️' },
    { to: '/admin/questions', label: 'Question Bank', icon: '📚' },
    { to: '/admin/students', label: 'Students', icon: '👥' }
  ];

  return (
    <div className="min-h-screen bg-white text-black flex flex-col">
      {/* Top Header */}
      <header className="bg-black text-white px-6 py-3.5 flex items-center justify-between border-b border-black z-20">
        <div className="flex items-center space-x-3">
          <span className="w-8 h-8 rounded bg-white text-black flex items-center justify-center font-black text-base border border-white">
            M
          </span>
          <span className="font-bold text-lg tracking-tight uppercase">NPTEL Exam Administration</span>
        </div>

        <div className="flex items-center space-x-4 text-sm">
          <div className="text-right">
            <span className="block font-semibold text-white">{user.name}</span>
            <span className="block text-xs text-neutral-400">@{user.username || 'admin'}</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs bg-neutral-900 hover:bg-neutral-800 text-white px-3 py-1.5 rounded border border-neutral-700 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-black flex flex-col py-4 px-3 space-y-1 shrink-0">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-black text-white font-bold border border-black'
                    : 'text-neutral-700 hover:bg-neutral-100 hover:text-black border border-transparent'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </aside>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto p-8 bg-white">
          {children}
        </main>
      </div>
    </div>
  );
}
