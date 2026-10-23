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
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [restartMode, setRestartMode] = useState<'separate' | 'merge'>('separate');
  const [restartTitle, setRestartTitle] = useState('');
  const [isRestarting, setIsRestarting] = useState(false);

  // Fetch all exams for dropdown
  const { data: exams = [], refetch: refetchExams } = useQuery({
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
  const currentExam = exams.find((e: any) => e.id === selectedExamId);

  // Poll monitor endpoint every 3 seconds
  const { data: monitorData, refetch } = useQuery<MonitorResponse>({
    queryKey: ['adminLiveMonitor', selectedExamId],
    queryFn: () => api.get(`/admin/exams/${selectedExamId}/monitor`),
    enabled: !!selectedExamId,
    refetchInterval: 3000
  });

  // Query for student attempt inspection
  const { data: inspectData, isLoading: isInspectLoading } = useQuery({
    queryKey: ['adminAttemptInspect', selectedAttemptId],
    queryFn: () => api.get(`/admin/attempts/${selectedAttemptId}/inspect`),
    enabled: !!selectedAttemptId
  });

  const handleRestartExam = async () => {
    if (!selectedExamId) return;
    setIsRestarting(true);
    try {
      const res = await api.post(`/admin/exams/${selectedExamId}/restart`, {
        mode: restartMode,
        title: restartTitle.trim() || undefined
      });
      setShowRestartModal(false);
      refetchExams();
      if (res.id) {
        setSearchParams({ examId: res.id });
      }
    } catch (err: any) {
      alert(err.message || 'Restart failed');
    } finally {
      setIsRestarting(false);
    }
  };

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
                [{e.status.toUpperCase()}] {e.title} {e.instanceNumber > 1 ? `(Run ${e.instanceNumber})` : ''}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              setShowRestartModal(true);
              setRestartMode('separate');
              setRestartTitle('');
            }}
            className="px-3.5 py-2 bg-black hover:bg-neutral-800 text-white rounded text-xs font-bold uppercase transition-colors whitespace-nowrap"
          >
            Restart Exam 🔄
          </button>
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
                <th className="py-3 px-4 text-center">Safe Browser</th>
                <th className="py-3 px-4 text-center">Tab Switches</th>
                <th className="py-3 px-4">Deadline</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y border-b border-black">
              {filteredStudents.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-neutral-500">No students matching criteria.</td></tr>
              ) : (
                filteredStudents.map((s: MonitorStudentRow) => {
                  const pct = s.totalQuestions > 0 ? Math.round((s.answeredCount / s.totalQuestions) * 100) : 0;
                  const isInProgress = s.status === 'in_progress';
                  const isSubmitted = s.status === 'submitted' || s.status === 'auto_submitted';

                  let statusBadge = 'bg-neutral-100 text-neutral-600 border border-neutral-300';
                  if (isInProgress) statusBadge = 'bg-black text-white border border-black font-bold';
                  if (isSubmitted) statusBadge = 'bg-neutral-100 text-black border border-black font-bold';

                  const securityCount = (s.securityViolations || 0) + (s.tabSwitches || 0);

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
                        {s.status === 'not_joined' ? (
                          <span className="text-xs text-neutral-400">—</span>
                        ) : securityCount > 0 ? (
                          <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-300 px-2 py-0.5 rounded inline-flex items-center space-x-1">
                            <span>⚠️ {securityCount} violations</span>
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded inline-flex items-center space-x-1">
                            <span>🛡️ Locked</span>
                          </span>
                        )}
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
                      <td className="py-3 px-4 text-right space-x-2">
                        {s.attemptId && (
                          <button
                            onClick={() => setSelectedAttemptId(s.attemptId!)}
                            className="px-2.5 py-1 bg-black text-white hover:bg-neutral-800 text-xs font-bold rounded uppercase transition-colors"
                          >
                            Inspect 👁️
                          </button>
                        )}
                        {isInProgress && s.attemptId && (
                          <button
                            onClick={() => handleForceSubmit(s.attemptId!, s.rollNo)}
                            className="text-xs text-neutral-700 hover:text-black font-bold underline"
                          >
                            Force Submit
                          </button>
                        )}
                        {s.attemptId && (
                          <button
                            onClick={() => handleResetAttempt(s.attemptId!, s.rollNo)}
                            className="text-xs text-neutral-700 hover:text-black font-bold underline"
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

      {/* Student Attempt Live Inspection Drawer */}
      {selectedAttemptId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex justify-end">
          <div className="bg-white max-w-2xl w-full h-full border-l-2 border-black p-6 overflow-y-auto space-y-6 text-black">
            <div className="flex items-center justify-between pb-4 border-b border-black">
              <div>
                <h3 className="text-xl font-black text-black uppercase tracking-tight">
                  {inspectData?.student?.name || 'Student Attempt Inspection'}
                </h3>
                <p className="text-xs font-mono text-neutral-600">
                  Roll No: {inspectData?.student?.rollNo} | Status: <span className="font-bold uppercase text-black">{inspectData?.attempt?.status}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedAttemptId(null)}
                className="text-xl font-bold p-1 hover:text-neutral-500"
              >
                ✕
              </button>
            </div>

            {isInspectLoading ? (
              <div className="p-8 text-center text-neutral-500 font-bold">Loading student attempt details...</div>
            ) : inspectData ? (
              <>
                {/* Stats Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-neutral-50 p-4 rounded border border-black text-center">
                  <div>
                    <span className="text-[11px] font-bold uppercase text-neutral-500">Progress</span>
                    <p className="text-lg font-black text-black mt-0.5">
                      {inspectData.stats.answeredCount} / {inspectData.stats.totalQuestions}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase text-neutral-500">Correct Est.</span>
                    <p className="text-lg font-black text-black mt-0.5">{inspectData.stats.correctCount}</p>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase text-neutral-500">Safe Browser</span>
                    <p className="text-xs font-bold text-emerald-700 mt-1">
                      {inspectData.attempt.isSafeBrowser ? '🛡️ Active' : 'Standard'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold uppercase text-neutral-500">Violations</span>
                    <p className="text-lg font-black text-red-600 mt-0.5">
                      {(inspectData.attempt.securityViolations || 0) + (inspectData.attempt.tabSwitches || 0)}
                    </p>
                  </div>
                </div>

                {/* Emergency Controls */}
                <div className="flex items-center justify-between p-3 bg-neutral-100 rounded border border-black">
                  <span className="text-xs font-bold uppercase text-black">Emergency Actions:</span>
                  <div className="space-x-3">
                    {inspectData.attempt.status === 'in_progress' && (
                      <button
                        onClick={async () => {
                          await handleForceSubmit(inspectData.attempt.id, inspectData.student.rollNo);
                          setSelectedAttemptId(null);
                        }}
                        className="px-3 py-1 bg-black text-white rounded text-xs font-bold uppercase hover:bg-neutral-800"
                      >
                        Force Submit
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        await handleResetAttempt(inspectData.attempt.id, inspectData.student.rollNo);
                        setSelectedAttemptId(null);
                      }}
                      className="px-3 py-1 bg-white text-black border border-black rounded text-xs font-bold uppercase hover:bg-neutral-100"
                    >
                      Reset Attempt
                    </button>
                  </div>
                </div>

                {/* Question-by-Question Live View */}
                <div className="space-y-4">
                  <h4 className="font-bold text-sm uppercase text-black border-b border-black pb-2">
                    Questions Assigned & Answers Given ({inspectData.questions?.length})
                  </h4>

                  <div className="space-y-3">
                    {inspectData.questions?.map((q: any) => {
                      const isAnswered = q.studentAnswer !== null;

                      return (
                        <div key={q.questionId} className="p-4 bg-white rounded border border-black space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold uppercase text-black">
                              Q{q.index}. {q.topic} {q.subtopic ? `(${q.subtopic})` : ''}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase border border-black ${
                                !isAnswered
                                  ? 'bg-neutral-100 text-neutral-600'
                                  : q.isCorrect
                                  ? 'bg-black text-white'
                                  : 'bg-neutral-200 text-black'
                              }`}
                            >
                              {!isAnswered ? 'Unanswered' : q.isCorrect ? '✓ Correct' : '✕ Wrong'}
                            </span>
                          </div>

                          <p className="text-xs text-black leading-relaxed font-medium">{q.bodyMd}</p>

                          {q.codeSnippet && (
                            <pre className="p-2 bg-neutral-50 rounded border border-neutral-300 font-mono text-[11px] overflow-x-auto text-black">
                              {q.codeSnippet}
                            </pre>
                          )}

                          <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                            {q.options?.map((opt: any) => {
                              const isSelected = q.studentAnswer === opt.key;
                              const isCorrectOpt = q.correctAnswer?.toLowerCase() === opt.key?.toLowerCase();

                              let optClass = 'border-neutral-200 bg-white text-neutral-700';
                              if (isSelected && isCorrectOpt) {
                                optClass = 'border-black bg-neutral-900 text-white font-bold';
                              } else if (isSelected && !isCorrectOpt) {
                                optClass = 'border-black bg-neutral-200 text-black font-semibold';
                              } else if (isCorrectOpt) {
                                optClass = 'border-black bg-neutral-100 text-black font-bold';
                              }

                              return (
                                <div key={opt.key} className={`p-2 rounded border text-[11px] ${optClass}`}>
                                  <span className="font-bold mr-1.5 uppercase">[{opt.key}]</span>
                                  <span>{opt.text}</span>
                                  {isSelected && <span className="ml-1 text-[10px] font-black uppercase">(Chosen)</span>}
                                  {isCorrectOpt && <span className="ml-1 text-[10px] font-black uppercase">✓</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* Restart Modal */}
      {showRestartModal && currentExam && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-lg w-full p-6 space-y-5 border-2 border-black">
            <div className="border-b border-black pb-3">
              <h3 className="text-lg font-bold text-black uppercase">Restart Exam: {currentExam.title}</h3>
              <p className="text-xs text-neutral-600 mt-1">
                Choose whether to keep exam runs isolated in separate instances or merge test-takers together.
              </p>
            </div>

            <div className="space-y-3">
              <label
                onClick={() => setRestartMode('separate')}
                className={`block p-4 rounded border-2 cursor-pointer transition-all ${
                  restartMode === 'separate' ? 'border-black bg-neutral-100' : 'border-neutral-300 hover:border-black'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <input
                    type="radio"
                    name="restartMode"
                    checked={restartMode === 'separate'}
                    onChange={() => setRestartMode('separate')}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-bold text-sm text-black uppercase">Option 1: Create Separate Instance (New Run)</p>
                    <p className="text-xs text-neutral-600 mt-1">
                      <strong>Zero collision:</strong> Creates an independent instance (e.g. Run {(currentExam.instanceNumber || 1) + 1}). Past examinees' results and records remain completely separate and uncollided.
                    </p>
                  </div>
                </div>
              </label>

              <label
                onClick={() => setRestartMode('merge')}
                className={`block p-4 rounded border-2 cursor-pointer transition-all ${
                  restartMode === 'merge' ? 'border-black bg-neutral-100' : 'border-neutral-300 hover:border-black'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <input
                    type="radio"
                    name="restartMode"
                    checked={restartMode === 'merge'}
                    onChange={() => setRestartMode('merge')}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-bold text-sm text-black uppercase">Option 2: Merge with Existing Instance</p>
                    <p className="text-xs text-neutral-600 mt-1">
                      <strong>Reopen instance:</strong> Retains existing completed submissions and allows new students to join and merge their results into this same instance.
                    </p>
                  </div>
                </div>
              </label>
            </div>

            {restartMode === 'separate' && (
              <div>
                <label className="block text-xs font-bold uppercase text-black mb-1">
                  New Instance Title (Optional):
                </label>
                <input
                  type="text"
                  value={restartTitle}
                  onChange={e => setRestartTitle(e.target.value)}
                  placeholder={`${currentExam.title.replace(/\s*\(Run\s+\d+\)$/i, '')} (Run ${(currentExam.instanceNumber || 1) + 1})`}
                  className="w-full px-3 py-2 border border-black rounded text-sm text-black"
                />
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-3 border-t border-black">
              <button
                type="button"
                onClick={() => setShowRestartModal(false)}
                className="px-4 py-2 text-sm text-black border border-neutral-300 rounded hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRestartExam}
                disabled={isRestarting}
                className="px-5 py-2 bg-black hover:bg-neutral-800 disabled:bg-neutral-400 text-white font-bold rounded text-sm uppercase"
              >
                {isRestarting ? 'Restarting...' : 'Confirm Restart'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
