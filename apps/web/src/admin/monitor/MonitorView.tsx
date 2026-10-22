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
    <div className="space-y-6 bg-white text-black">
      {/* Top Bar with Exam Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-black">Live Exam Monitor</h1>
          <p className="text-neutral-600 text-sm">Real-time status, progress tracking, and emergency controls</p>
        </div>

        <div className="flex items-center space-x-3">
          <label className="text-xs font-bold uppercase text-black">Select Exam:</label>
          <select
            value={selectedExamId}
            onChange={(e) => setSearchParams({ examId: e.target.value })}
            className="px-3.5 py-2 border border-black rounded text-sm bg-white font-bold text-black"
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
          <div className="bg-white p-5 rounded border border-black">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Total Eligible</span>
            <p className="text-2xl font-black text-black mt-1">{monitorData.counts.eligible}</p>
          </div>
          <div className="bg-white p-5 rounded border border-black">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Not Yet Joined</span>
            <p className="text-2xl font-black text-black mt-1">{monitorData.counts.notJoined}</p>
          </div>
          <div className="bg-white p-5 rounded border border-black">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">In Progress</span>
            <p className="text-2xl font-black text-black mt-1">{monitorData.counts.inProgress}</p>
          </div>
          <div className="bg-white p-5 rounded border border-black">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Submitted</span>
            <p className="text-2xl font-black text-black mt-1">{monitorData.counts.submitted}</p>
          </div>
        </div>
      )}

      {/* Filter and Table */}
      <div className="bg-white rounded border border-black space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search student roll number or name..."
            className="w-full max-w-sm px-3.5 py-1.5 border border-black rounded text-sm text-black focus:outline-none focus:ring-1 focus:ring-black"
          />

          <div className="flex items-center space-x-3">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 border border-black rounded text-xs bg-white text-black font-semibold"
            >
              <option value="">All Statuses</option>
              <option value="in_progress">In Progress</option>
              <option value="submitted">Submitted</option>
              <option value="auto_submitted">Auto Submitted</option>
              <option value="not_joined">Not Joined</option>
            </select>
            <span className="text-xs text-neutral-600 font-bold uppercase flex items-center">
              <span className="w-2 h-2 rounded-full bg-black mr-1.5"></span>
              Live Polling (3s)
            </span>
          </div>
        </div>

        {/* Monitor Table */}
        <div className="overflow-x-auto rounded border border-black">
          <table className="w-full text-left text-sm text-black">
            <thead className="bg-neutral-100 text-xs text-black font-bold border-b border-black uppercase">
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
            <tbody className="divide-y border-b border-black">
              {filteredStudents.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-neutral-500">No students matching criteria.</td></tr>
              ) : (
                filteredStudents.map((s: MonitorStudentRow) => {
                  const pct = s.totalQuestions > 0 ? Math.round((s.answeredCount / s.totalQuestions) * 100) : 0;
                  const isInProgress = s.status === 'in_progress';
                  const isSubmitted = s.status === 'submitted' || s.status === 'auto_submitted';

                  let statusBadge = 'bg-neutral-100 text-neutral-600 border border-neutral-300';
                  if (isInProgress) statusBadge = 'bg-black text-white border border-black font-bold';
                  if (isSubmitted) statusBadge = 'bg-neutral-100 text-black border border-black font-bold';

                  return (
                    <tr key={s.studentId} className="hover:bg-neutral-50">
                      <td className="py-3 px-4 font-mono font-bold text-black">{s.rollNo}</td>
                      <td className="py-3 px-4 font-medium text-black">{s.name}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2.5 py-0.5 rounded uppercase font-bold ${statusBadge}`}>
                          {s.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="w-36 space-y-1">
                          <div className="flex justify-between text-xs text-neutral-600 font-semibold">
                            <span>{s.answeredCount} / {s.totalQuestions}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="w-full bg-neutral-200 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-black h-1.5 rounded-full" style={{ width: `${pct}%` }}></div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {s.tabSwitches > 0 ? (
                          <span className="text-xs font-bold text-black bg-neutral-100 px-2 py-0.5 rounded border border-black">
                            {s.tabSwitches} switches
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-400">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-neutral-600">
                        {s.deadlineAt ? new Date(s.deadlineAt).toLocaleTimeString() : '—'}
                      </td>
                      <td className="py-3 px-4 text-right space-x-3">
                        {isInProgress && s.attemptId && (
                          <button
                            onClick={() => handleForceSubmit(s.attemptId!, s.rollNo)}
                            className="text-xs text-black hover:text-neutral-600 font-bold underline"
                          >
                            Force Submit
                          </button>
                        )}
                        {s.attemptId && (
                          <button
                            onClick={() => handleResetAttempt(s.attemptId!, s.rollNo)}
                            className="text-xs text-black hover:text-neutral-600 font-bold underline"
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
