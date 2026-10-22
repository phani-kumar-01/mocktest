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
    { to: '/admin/questions', label: 'Question Bank', icon: '📚' },
    { to: '/admin/students', label: 'Students', icon: '👥' }
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between shadow-md z-20">
        <div className="flex items-center space-x-3">
          <span className="w-8 h-8 rounded-lg bg-sky-500 text-white flex items-center justify-center font-bold text-base">
            M
          </span>
          <span className="font-bold text-lg tracking-tight text-white">NPTEL Exam Administration</span>
        </div>

        <div className="flex items-center space-x-4 text-sm">
          <div className="text-right">
            <span className="block font-semibold text-slate-200">{user.name}</span>
            <span className="block text-xs text-slate-400">@{user.username || 'admin'}</span>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col py-4 px-3 space-y-1 shadow-sm shrink-0">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-sky-50 text-sky-700 font-bold border border-sky-100 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </aside>

        {/* Content Body */}
        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
