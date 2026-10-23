import { useQuery } from '@tanstack/react-query';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import AdminLogin from './shell/AdminLogin.js';
import AdminShell from './shell/AdminShell.js';
import DashboardView from './dashboard/DashboardView.js';
import ExamsView from './exams/ExamsView.js';
import MonitorView from './monitor/MonitorView.js';
import ResultsView from './results/ResultsView.js';
import MailDispatchView from './mail/MailDispatchView.js';
import QuestionsView from './questions/QuestionsView.js';
import StudentsView from './students/StudentsView.js';
import { AuthMeResponse } from '@nptel/shared';

export default function AdminApp() {
  const { data: auth, refetch, isLoading } = useQuery<AuthMeResponse>({
    queryKey: ['adminAuthMe'],
    queryFn: () => api.get('/auth/me'),
    retry: false
  });

  const isAuthenticated = auth?.role === 'admin' && auth.user;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-sm animate-pulse">Loading Admin Portal...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminLogin onSuccess={() => refetch()} />;
  }

  return (
    <AdminShell user={auth.user}>
      <Routes>
        <Route path="dashboard" element={<DashboardView />} />
        <Route path="exams" element={<ExamsView />} />
        <Route path="monitor" element={<MonitorView />} />
        <Route path="results" element={<ResultsView />} />
        <Route path="mail" element={<MailDispatchView />} />
        <Route path="questions" element={<QuestionsView />} />
        <Route path="students" element={<StudentsView />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </AdminShell>
  );
}
