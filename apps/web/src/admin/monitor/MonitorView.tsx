import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { MonitorResponse, MonitorStudentRow } from '@nptel/shared';

export default function MonitorView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const examIdParam = searchParams.get('examId') || '';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Fetch all exams for dropdown
  const { data: exams = [] } = useQuery({
    queryKey: ['adminExamsListForMonitor'],
    queryFn: async () => {
      const list = await api.get('/admin/exams');
      if (list.length > 0 && !examIdParam) {
        const live = list.find((e: any) => e.status === 'live');
        setSearchParams({ examId: live ? live.id : list[0].id });
      }
      return list;
    }
  });

  const selectedExamId = examIdParam || (exams[0]?.id || '');

  // Poll monitor endpoint every 3 seconds
  const { data: monitorData, refetch } = useQuery<MonitorResponse>({
    queryKey: ['adminLiveMonitor', selectedExamId],
    queryFn: () => api.get(`/admin/exams/${selectedExamId}/monitor`),
    enabled: !!selectedExamId,
    refetchInterval: 3000
  });

  const handleForceSubmit = async (attemptId: string, rollNo: string) => {
    if (!confirm(`Force-submit exam for student ${rollNo}?`)) return;
    try {
      await api.post(`/admin/attempts/${attemptId}/force-submit`);
      refetch();
    } catch (err: any) {
      alert(err.message || 'Force submit failed');
    }
  };

  const handleResetAttempt = async (attemptId: string, rollNo: string) => {
    if (!confirm(`RESET attempt for ${rollNo}? This will delete all saved answers and allow the student to re-enter! Use only for confirmed technical faults.`)) return;
    try {
      await api.post(`/admin/attempts/${attemptId}/reset`);
      refetch();
    } catch (err: any) {
      alert(err.message || 'Reset failed');
    }
  };

  const filteredStudents = (monitorData?.students || []).filter((s: MonitorStudentRow) => {
    if (statusFilter && s.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.rollNo.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Bar with Exam Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Live Exam Monitor</h1>
          <p className="text-slate-500 text-sm">Real-time status, progress tracking, and emergency controls</p>
        </div>

        <div className="flex items-center space-x-3">
          <label className="text-xs font-semibold text-slate-600">Select Exam:</label>
          <select
            value={selectedExamId}
            onChange={(e) => setSearchParams({ examId: e.target.value })}
            className="px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-white font-semibold text-slate-800 shadow-sm"
          >
            {exams.map((e: any) => (
              <option key={e.id} value={e.id}>
                [{e.status.toUpperCase()}] {e.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Live Counter Cards */}
      {monitorData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Eligible</span>
            <p className="text-2xl font-black text-slate-800 mt-1">{monitorData.counts.eligible}</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Not Yet Joined</span>
            <p className="text-2xl font-black text-slate-500 mt-1">{monitorData.counts.notJoined}</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-600">In Progress</span>
            <p className="text-2xl font-black text-sky-600 mt-1">{monitorData.counts.inProgress}</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Submitted</span>
            <p className="text-2xl font-black text-emerald-600 mt-1">{monitorData.counts.submitted}</p>
          </div>
        </div>
      )}

      {/* Filter and Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search student roll number or name..."
            className="w-full max-w-sm px-3.5 py-1.5 border border-slate-300 rounded-lg text-sm"
          />

          <div className="flex items-center space-x-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
            >
              <option value="">All Statuses</option>
              <option value="in_progress">In Progress</option>
              <option value="submitted">Submitted</option>
              <option value="auto_submitted">Auto Submitted</option>
              <option value="not_joined">Not Joined</option>
            </select>
            <span className="text-xs text-slate-400 flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
              Live Polling (3s)
            </span>
          </div>
        </div>

        {/* Monitor Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-50 text-xs text-slate-500 font-semibold border-b">
              <tr>
                <th className="py-3 px-4">Roll Number</th>
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Answer Progress</th>
                <th className="py-3 px-4 text-center">Tab Switches</th>
                <th className="py-3 px-4">Deadline</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">No students matching criteria.</td></tr>
              ) : (
                filteredStudents.map((s: MonitorStudentRow) => {
                  const pct = s.totalQuestions > 0 ? Math.round((s.answeredCount / s.totalQuestions) * 100) : 0;
                  const isInProgress = s.status === 'in_progress';
                  const isSubmitted = s.status === 'submitted' || s.status === 'auto_submitted';

                  let statusBadge = 'bg-slate-100 text-slate-600';
                  if (isInProgress) statusBadge = 'bg-sky-100 text-sky-800 font-bold';
                  if (isSubmitted) statusBadge = 'bg-emerald-100 text-emerald-800 font-bold';

                  return (
                    <tr key={s.studentId} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{s.rollNo}</td>
                      <td className="py-3 px-4 font-medium text-slate-800">{s.name}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2.5 py-0.5 rounded-full ${statusBadge}`}>
                          {s.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="w-36 space-y-1">
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>{s.answeredCount} / {s.totalQuestions}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-sky-500 h-1.5 rounded-full" style={{ width: `${pct}%` }}></div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {s.tabSwitches > 0 ? (
                          <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            {s.tabSwitches} switches
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-slate-500">
                        {s.deadlineAt ? new Date(s.deadlineAt).toLocaleTimeString() : '—'}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {isInProgress && s.attemptId && (
                          <button
                            onClick={() => handleForceSubmit(s.attemptId!, s.rollNo)}
                            className="text-xs text-red-600 hover:text-red-800 font-semibold"
                          >
                            Force Submit
                          </button>
                        )}
                        {s.attemptId && (
                          <button
                            onClick={() => handleResetAttempt(s.attemptId!, s.rollNo)}
                            className="text-xs text-amber-600 hover:text-amber-800 font-semibold"
                          >
                            Reset
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
