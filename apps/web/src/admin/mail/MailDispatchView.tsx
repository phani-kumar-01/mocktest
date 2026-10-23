import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';

export default function MailDispatchView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const examIdParam = searchParams.get('examId') || '';

  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Test mail states
  const [testEmailTo, setTestEmailTo] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Action states
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSendingSelected, setIsSendingSelected] = useState(false);
  const [isRetryingFailed, setIsRetryingFailed] = useState(false);
  const [sendingNowId, setSendingNowId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // 1. Exams list
  const { data: exams = [] } = useQuery({
    queryKey: ['adminExamsListForMail'],
    queryFn: async () => {
      const list = await api.get('/admin/exams');
      if (list.length > 0 && !examIdParam) {
        setSearchParams({ examId: list[0].id });
      }
      return list;
    }
  });

  const selectedExamId = examIdParam || (exams[0]?.id || '');

  // 2. Mail Status query (polls every 4 seconds)
  const { data: mailStatus, refetch: refetchMail, isLoading } = useQuery({
    queryKey: ['adminMailStatus', selectedExamId],
    queryFn: () => api.get(`/admin/exams/${selectedExamId}/mail-status`),
    enabled: !!selectedExamId,
    refetchInterval: 4000
  });

  const students = mailStatus?.students || [];

  // Filtering
  const filteredStudents = students.filter((s: any) => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const matchRoll = s.rollNo?.toLowerCase().includes(q);
      const matchName = s.name?.toLowerCase().includes(q);
      const matchEmail = s.email?.toLowerCase().includes(q);
      if (!matchRoll && !matchName && !matchEmail) return false;
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'pending' && s.status !== 'pending' && s.status !== 'sending') return false;
      if (statusFilter === 'sent' && s.status !== 'sent') return false;
      if (statusFilter === 'failed' && s.status !== 'failed') return false;
      if (statusFilter === 'skipped' && s.status !== 'skipped') return false;
    }

    return true;
  });

  // Select All logic
  const allFilteredSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every((s: any) => selectedStudentIds.includes(s.studentId));

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filteredStudents.map((s: any) => s.studentId));
      setSelectedStudentIds(prev => prev.filter(id => !filteredIds.has(id)));
    } else {
      const newSelected = new Set([...selectedStudentIds, ...filteredStudents.map((s: any) => s.studentId)]);
      setSelectedStudentIds(Array.from(newSelected));
    }
  };

  const handleToggleSelectStudent = (id: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Actions
  const handlePublishAll = async () => {
    if (!confirm('Publish results and enqueue emails to all students?')) return;
    setIsPublishing(true);
    setActionMessage(null);
    try {
      const res: any = await api.post(`/admin/exams/${selectedExamId}/publish`);
      setActionMessage(`Enqueued ${res.enqueuedCount || 0} emails into the delivery queue.`);
      refetchMail();
    } catch (err: any) {
      alert(err.message || 'Failed to publish results');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSendSelected = async () => {
    if (selectedStudentIds.length === 0) return;
    setIsSendingSelected(true);
    setActionMessage(null);
    try {
      const res: any = await api.post(`/admin/exams/${selectedExamId}/mail/send-selected`, {
        studentIds: selectedStudentIds
      });
      setActionMessage(`Enqueued ${res.enqueuedCount || 0} selected student(s) for delivery.`);
      setSelectedStudentIds([]);
      refetchMail();
    } catch (err: any) {
      alert(err.message || 'Failed to enqueue selected students');
    } finally {
      setIsSendingSelected(false);
    }
  };

  const handleRetryFailed = async () => {
    setIsRetryingFailed(true);
    setActionMessage(null);
    try {
      const res: any = await api.post(`/admin/exams/${selectedExamId}/mail/retry-failed`);
      setActionMessage(`Re-enqueued ${res.retriedCount || 0} failed email(s).`);
      refetchMail();
    } catch (err: any) {
      alert(err.message || 'Failed to retry');
    } finally {
      setIsRetryingFailed(false);
    }
  };

  const handleSendNow = async (studentId: string, rollNo: string) => {
    setSendingNowId(studentId);
    setActionMessage(null);
    try {
      const res: any = await api.post(`/admin/exams/${selectedExamId}/students/${studentId}/mail/send-now`);
      setActionMessage(`✓ Success: ${res.message || `Delivered to ${rollNo}`}`);
      refetchMail();
    } catch (err: any) {
      alert(err.message || `Failed to send email to ${rollNo}`);
    } finally {
      setSendingNowId(null);
    }
  };

  const handleSendTestMail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailTo) return;
    setIsSendingTest(true);
    setTestResult(null);
    try {
      const res: any = await api.post('/admin/mail/test', { to: testEmailTo });
      setTestResult({ success: true, message: res.message || 'Test mail delivered successfully!' });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Test mail failed to send.' });
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="space-y-6 bg-white text-black">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black pb-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-black">Email & Report Dispatch</h1>
          <p className="text-neutral-600 text-sm">Send official exam scorecards and PDF performance reports to students</p>
        </div>

        {/* Exam Picker */}
        <div className="flex items-center space-x-3">
          <label className="text-xs font-bold uppercase text-neutral-600">Active Exam:</label>
          <select
            value={selectedExamId}
            onChange={e => setSearchParams({ examId: e.target.value })}
            className="px-3.5 py-2 border border-black rounded text-sm bg-white font-bold text-black"
          >
            {exams.map((e: any) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Top Section: Quick Test Email Tool */}
      <div className="p-4 bg-neutral-50 rounded border border-black space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-black flex items-center">
            <span className="w-2 h-2 rounded-full bg-black mr-2"></span>
            SMTP / Email Connection Test
          </h3>
          <span className="text-[11px] font-mono text-neutral-600">Provider: Brevo SMTP (Port 587)</span>
        </div>

        <form onSubmit={handleSendTestMail} className="flex flex-col sm:flex-row items-center gap-3">
          <input
            type="email"
            value={testEmailTo}
            onChange={e => setTestEmailTo(e.target.value)}
            placeholder="Enter test recipient email (e.g. phanikumar.koppisetti24@sasi.ac.in)..."
            required
            className="flex-1 px-3 py-2 border border-black rounded text-sm bg-white font-mono text-black w-full"
          />
          <button
            type="submit"
            disabled={isSendingTest}
            className="px-4 py-2 bg-black hover:bg-neutral-800 disabled:bg-neutral-400 text-white font-bold text-xs rounded border border-black transition-colors whitespace-nowrap w-full sm:w-auto"
          >
            {isSendingTest ? 'Sending Test...' : '✉️ Send Test Email'}
          </button>
        </form>

        {testResult && (
          <div
            className={`p-2.5 rounded text-xs font-medium border ${
              testResult.success
                ? 'bg-neutral-100 text-black border-black'
                : 'bg-neutral-200 text-black border-black'
            }`}
          >
            {testResult.success ? '✓' : '✕'} {testResult.message}
          </div>
        )}
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div className="p-3 bg-neutral-100 border border-black rounded text-xs font-bold text-black flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="font-bold text-neutral-500 hover:text-black">✕</button>
        </div>
      )}

      {/* Live Stats Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
        <div className="p-3 rounded bg-white border border-black">
          <span className="text-2xl font-black">{mailStatus?.total || 0}</span>
          <p className="text-[11px] text-neutral-500 uppercase font-bold mt-1">Total Students</p>
        </div>
        <div className="p-3 rounded bg-neutral-100 border border-black">
          <span className="text-2xl font-black text-black">
            {(mailStatus?.pending || 0) + (mailStatus?.sending || 0)}
          </span>
          <p className="text-[11px] text-black uppercase font-bold mt-1">Pending / Sending</p>
        </div>
        <div className="p-3 rounded bg-black text-white border border-black">
          <span className="text-2xl font-black text-white">{mailStatus?.sent || 0}</span>
          <p className="text-[11px] text-neutral-300 uppercase font-bold mt-1">Delivered (Sent)</p>
        </div>
        <div className="p-3 rounded bg-neutral-200 border border-black">
          <span className="text-2xl font-black text-black">{mailStatus?.failed || 0}</span>
          <p className="text-[11px] text-black uppercase font-bold mt-1">Failed</p>
        </div>
        <div className="p-3 rounded bg-white border border-black">
          <span className="text-2xl font-black text-neutral-400">{mailStatus?.skipped || 0}</span>
          <p className="text-[11px] text-neutral-500 uppercase font-bold mt-1">Skipped (No Email)</p>
        </div>
      </div>

      {/* Toolbar: Actions + Select Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 bg-neutral-50 rounded border border-black">
        {/* Bulk Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handlePublishAll}
            disabled={isPublishing}
            className="px-4 py-2 bg-black hover:bg-neutral-800 disabled:bg-neutral-400 text-white font-bold text-xs rounded border border-black transition-colors"
          >
            {isPublishing ? 'Publishing...' : '📢 Publish & Send to All'}
          </button>

          <button
            onClick={handleSendSelected}
            disabled={isSendingSelected || selectedStudentIds.length === 0}
            className="px-4 py-2 bg-white hover:bg-neutral-100 disabled:opacity-40 disabled:hover:bg-white text-black font-bold text-xs rounded border border-black transition-colors"
          >
            {isSendingSelected ? 'Enqueueing...' : `✉️ Send to Selected (${selectedStudentIds.length})`}
          </button>

          <button
            onClick={handleRetryFailed}
            disabled={isRetryingFailed || (mailStatus?.failed || 0) === 0}
            className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 disabled:opacity-40 text-black font-bold text-xs rounded border border-black transition-colors"
          >
            {isRetryingFailed ? 'Retrying...' : '↺ Retry Failed'}
          </button>

          <button
            onClick={() => refetchMail()}
            className="p-2 border border-black rounded text-xs hover:bg-neutral-100"
            title="Refresh Status"
          >
            🔄
          </button>
        </div>

        {/* Search & Status Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search Roll No or Name..."
            className="px-3 py-1.5 border border-black rounded text-xs bg-white text-black font-mono w-48"
          />

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-black rounded text-xs bg-white text-black font-bold"
          >
            <option value="all">All Statuses ({students.length})</option>
            <option value="sent">Delivered ({mailStatus?.sent || 0})</option>
            <option value="pending">Pending / Sending ({(mailStatus?.pending || 0) + (mailStatus?.sending || 0)})</option>
            <option value="failed">Failed ({mailStatus?.failed || 0})</option>
            <option value="skipped">Skipped ({mailStatus?.skipped || 0})</option>
          </select>
        </div>
      </div>

      {/* Main Student Mail Table */}
      <div className="bg-white rounded border border-black overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs text-black border-collapse">
            <thead className="bg-neutral-100 sticky top-0 z-10 border-b border-black uppercase font-bold">
              <tr>
                <th className="p-3 w-10 text-center border-r border-black">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={handleToggleSelectAll}
                    className="w-4 h-4 cursor-pointer accent-black"
                  />
                </th>
                <th className="p-3 border-r border-black">Roll No</th>
                <th className="p-3 border-r border-black">Student Name</th>
                <th className="p-3 border-r border-black">Email Address</th>
                <th className="p-3 border-r border-black text-center">Status</th>
                <th className="p-3 border-r border-black">Delivery Details / Error</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y border-b border-black">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-neutral-500 font-bold">
                    Loading student delivery queue...
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-neutral-500">
                    No students matching the current filter.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s: any) => {
                  const isSelected = selectedStudentIds.includes(s.studentId);
                  const isSendingThis = sendingNowId === s.studentId;

                  return (
                    <tr
                      key={s.studentId}
                      className={`hover:bg-neutral-50 transition-colors ${
                        isSelected ? 'bg-neutral-100' : ''
                      }`}
                    >
                      <td className="p-3 text-center border-r border-black">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectStudent(s.studentId)}
                          className="w-4 h-4 cursor-pointer accent-black"
                        />
                      </td>

                      <td className="p-3 font-mono font-bold border-r border-black">
                        {s.rollNo}
                      </td>

                      <td className="p-3 font-semibold border-r border-black">
                        {s.name}
                      </td>

                      <td className="p-3 font-mono text-neutral-700 border-r border-black">
                        {s.email || <span className="text-neutral-400 italic">No email</span>}
                      </td>

                      <td className="p-3 text-center border-r border-black">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border border-black ${
                            s.status === 'sent'
                              ? 'bg-black text-white'
                              : s.status === 'failed'
                              ? 'bg-neutral-200 text-black'
                              : s.status === 'sending' || s.status === 'pending'
                              ? 'bg-neutral-100 text-black'
                              : 'bg-white text-neutral-400'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>

                      <td className="p-3 text-neutral-600 truncate max-w-xs border-r border-black">
                        {s.lastError ? (
                          <span className="text-black font-mono text-[11px]">{s.lastError}</span>
                        ) : s.status === 'sent' ? (
                          <span className="text-neutral-500 font-mono text-[11px]">Delivered with PDF report</span>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="p-3 text-right space-x-2 whitespace-nowrap">
                        {/* Instant Send Now button */}
                        <button
                          onClick={() => handleSendNow(s.studentId, s.rollNo)}
                          disabled={isSendingThis || !s.email}
                          className="px-2.5 py-1 bg-black hover:bg-neutral-800 disabled:opacity-30 text-white font-bold text-[11px] rounded border border-black transition-colors"
                          title="Generate report and dispatch immediately"
                        >
                          {isSendingThis ? 'Sending...' : '⚡ Send Now'}
                        </button>

                        {/* View PDF button */}
                        <a
                          href={`/api/admin/exams/${selectedExamId}/students/${s.studentId}/report.pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 bg-white hover:bg-neutral-100 text-black font-bold text-[11px] rounded border border-black transition-colors inline-block"
                        >
                          📄 PDF
                        </a>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="p-3 bg-neutral-100 border-t border-black text-xs text-neutral-600 flex items-center justify-between font-medium">
          <span>
            Showing {filteredStudents.length} of {students.length} students | Selected: {selectedStudentIds.length}
          </span>
          <span className="font-mono text-[11px]">Auto-refreshes every 4 seconds</span>
        </div>
      </div>
    </div>
  );
}
