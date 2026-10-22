import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

export default function ResultsView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const examIdParam = searchParams.get('examId') || '';
  const [activeTab, setActiveTab] = useState<'table' | 'heatmap' | 'charts' | 'mail'>('table');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [showScoringModal, setShowScoringModal] = useState(false);
  const [assignmentMarksInput, setAssignmentMarksInput] = useState(20);
  const [isPublishing, setIsPublishing] = useState(false);

  // Exams list for dropdown
  const { data: exams = [] } = useQuery({
    queryKey: ['adminExamsListForResults'],
    queryFn: async () => {
      const list = await api.get('/admin/exams');
      if (list.length > 0 && !examIdParam) {
        setSearchParams({ examId: list[0].id });
      }
      return list;
    }
  });

  const selectedExamId = examIdParam || (exams[0]?.id || '');

  // Results Query
  const { data: resultsData, refetch: refetchResults } = useQuery({
    queryKey: ['adminExamResults', selectedExamId],
    queryFn: () => api.get(`/admin/exams/${selectedExamId}/results`),
    enabled: !!selectedExamId
  });

  // Topic Matrix Query
  const { data: matrixData } = useQuery({
    queryKey: ['adminTopicMatrix', selectedExamId],
    queryFn: () => api.get(`/admin/exams/${selectedExamId}/topic-matrix`),
    enabled: !!selectedExamId && activeTab === 'heatmap'
  });

  // Mail Status Query
  const { data: mailStatus, refetch: refetchMail } = useQuery({
    queryKey: ['adminMailStatus', selectedExamId],
    queryFn: () => api.get(`/admin/exams/${selectedExamId}/mail-status`),
    enabled: !!selectedExamId && activeTab === 'mail',
    refetchInterval: activeTab === 'mail' ? 4000 : false
  });

  // Student Drilldown Query
  const { data: studentAnalysis } = useQuery({
    queryKey: ['adminStudentAnalysis', selectedExamId, selectedStudentId],
    queryFn: () => api.get(`/admin/exams/${selectedExamId}/students/${selectedStudentId}/analysis`),
    enabled: !!selectedExamId && !!selectedStudentId
  });

  const handleUpdateScoring = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put(`/admin/exams/${selectedExamId}/scoring`, { assignmentMarks: Number(assignmentMarksInput) });
      setShowScoringModal(false);
      refetchResults();
    } catch (err: any) {
      alert(err.message || 'Failed to update scoring');
    }
  };

  const handlePublishMails = async () => {
    if (!confirm('Publish results and enqueue emails to all students?')) return;
    setIsPublishing(true);
    try {
      await api.post(`/admin/exams/${selectedExamId}/publish`);
      setActiveTab('mail');
      refetchMail();
    } catch (err: any) {
      alert(err.message || 'Failed to publish results');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleRetryFailedMails = async () => {
    try {
      await api.post(`/admin/exams/${selectedExamId}/mail/retry-failed`);
      refetchMail();
    } catch (err: any) {
      alert(err.message || 'Failed to retry mails');
    }
  };

  const summary = resultsData?.summary;
  const rows = resultsData?.rows || [];

  return (
    <div className="space-y-6">
      {/* Header & Exam Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Results & Analytics</h1>
          <p className="text-slate-500 text-sm">NPTEL scoring, grade tier distribution, and topic mastery</p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedExamId}
            onChange={(e) => setSearchParams({ examId: e.target.value })}
            className="px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-white font-semibold text-slate-800 shadow-sm"
          >
            {exams.map((e: any) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>

          <a
            href={`/api/admin/exams/${selectedExamId}/export.xlsx`}
            download
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg text-sm hover:bg-slate-50 shadow-sm flex items-center space-x-1"
          >
            <span>📊</span>
            <span>Export Excel</span>
          </a>

          <button
            onClick={() => setShowScoringModal(true)}
            className="px-3.5 py-2 bg-slate-800 text-white font-medium rounded-lg text-sm hover:bg-slate-900 shadow-sm"
          >
            ⚙ Scoring Config
          </button>

          <button
            onClick={handlePublishMails}
            disabled={isPublishing}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-sm shadow-sm"
          >
            {isPublishing ? 'Publishing...' : '✉ Publish & Send Mails'}
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold uppercase text-slate-400">Total Attempts</span>
            <p className="text-2xl font-black text-slate-900 mt-1">{summary.totalAttempts}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold uppercase text-emerald-600">Pass Rate</span>
            <p className="text-2xl font-black text-emerald-600 mt-1">{summary.passRate}%</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold uppercase text-slate-400">Passed / Failed</span>
            <p className="text-xl font-black text-slate-800 mt-1">{summary.passedCount} / {summary.totalAttempts - summary.passedCount}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold uppercase text-sky-600">Average Score</span>
            <p className="text-2xl font-black text-sky-600 mt-1">{summary.avgTotal}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold uppercase text-slate-400">Median Score</span>
            <p className="text-2xl font-black text-slate-800 mt-1">{summary.medianTotal}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-bold uppercase text-slate-400">Highest / Lowest</span>
            <p className="text-xl font-black text-slate-800 mt-1">{summary.highestTotal} / {summary.lowestTotal}</p>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 space-x-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('table')}
          className={`pb-3 transition-colors ${activeTab === 'table' ? 'border-b-2 border-sky-600 text-sky-600' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Results Table ({rows.length})
        </button>
        <button
          onClick={() => setActiveTab('heatmap')}
          className={`pb-3 transition-colors ${activeTab === 'heatmap' ? 'border-b-2 border-sky-600 text-sky-600' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Topic Mastery Heatmap
        </button>
        <button
          onClick={() => setActiveTab('charts')}
          className={`pb-3 transition-colors ${activeTab === 'charts' ? 'border-b-2 border-sky-600 text-sky-600' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Distribution & Class Weaknesses
        </button>
        <button
          onClick={() => setActiveTab('mail')}
          className={`pb-3 transition-colors ${activeTab === 'mail' ? 'border-b-2 border-sky-600 text-sky-600' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Email Queue Tracker
        </button>
      </div>

      {/* Tab 1: Results Table */}
      {activeTab === 'table' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-50 text-xs text-slate-500 font-semibold border-b">
              <tr>
                <th className="py-3 px-4">Roll Number</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4 text-center">Correct / Wrong</th>
                <th className="py-3 px-4">Scaled (75)</th>
                <th className="py-3 px-4">Assignment (25)</th>
                <th className="py-3 px-4 font-bold">Total (100)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Grade Tier</th>
                <th className="py-3 px-4 text-right">Analysis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r: any) => (
                <tr key={r.studentId} className="hover:bg-slate-50/80">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">{r.rollNo}</td>
                  <td className="py-3 px-4 font-medium text-slate-800">{r.name}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="text-emerald-600 font-bold">{r.correctCount}</span>
                    <span className="text-slate-300 mx-1">/</span>
                    <span className="text-red-500 font-bold">{r.wrongCount}</span>
                  </td>
                  <td className="py-3 px-4 font-mono">{r.examScaled.toFixed(2)}</td>
                  <td className="py-3 px-4 font-mono">{r.assignmentMarks}</td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-900 text-base">{r.total.toFixed(2)}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                      {r.passed ? 'PASSED' : 'NOT PASSED'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs font-medium text-slate-700">{r.gradeLabel}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setSelectedStudentId(r.studentId)}
                      className="text-xs text-sky-600 hover:text-sky-800 font-semibold underline"
                    >
                      View Report
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Topic Mastery Heatmap */}
      {activeTab === 'heatmap' && matrixData && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b">
            <span>Color Guide: Strong (≥70%) green, Average (50–69%) amber, Weak (&lt;50%) red.</span>
            <span>{matrixData.rows?.length} Students × {matrixData.topics?.length} Topics</span>
          </div>

          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-slate-100 sticky top-0 z-10 font-bold text-slate-700 border-b">
                <tr>
                  <th className="p-2 text-left sticky left-0 bg-slate-100 min-w-[120px]">Roll Number</th>
                  {matrixData.topics.map((t: string) => (
                    <th key={t} className="p-2 min-w-[90px]">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matrixData.rows.map((row: any) => (
                  <tr key={row.studentId}>
                    <td className="p-2 text-left font-mono font-semibold sticky left-0 bg-white border-r">
                      {row.rollNo}
                    </td>
                    {matrixData.topics.map((topic: string) => {
                      const score = row.scores[topic];
                      if (!score) return <td key={topic} className="p-2 text-slate-300">—</td>;

                      let cellBg = 'bg-amber-100 text-amber-900';
                      if (score.level === 'strong') cellBg = 'bg-emerald-100 text-emerald-900 font-bold';
                      if (score.level === 'weak') cellBg = 'bg-red-100 text-red-900 font-bold';

                      return (
                        <td key={topic} className={`p-2 ${cellBg}`}>
                          {score.pct.toFixed(0)}%
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Charts */}
      {activeTab === 'charts' && summary && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h4 className="font-bold text-slate-800 text-base">Score Distribution</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.distribution}>
                  <XAxis dataKey="bin" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0284c7" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <h4 className="font-bold text-slate-800 text-base">Class Weak Topics (Lowest Average %)</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={matrixData?.classWeak || []} layout="vertical">
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis type="category" dataKey="topic" width={110} />
                  <Tooltip />
                  <Bar dataKey="avgPct" fill="#f87171" radius={[0, 4, 4, 0]}>
                    {(matrixData?.classWeak || []).map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.avgPct < 50 ? '#ef4444' : entry.avgPct < 70 ? '#f59e0b' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Email Queue Status */}
      {activeTab === 'mail' && mailStatus && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
          <div className="flex items-center justify-between pb-4 border-b">
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Result Dispatch & Email Queue</h3>
              <p className="text-xs text-slate-500">Live background worker status sending PDF report attachments</p>
            </div>

            <button
              onClick={handleRetryFailedMails}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-lg"
            >
              ↺ Retry Failed Sends
            </button>
          </div>

          {/* Counts */}
          <div className="grid grid-cols-5 gap-3 text-center">
            <div className="p-3 rounded-xl bg-slate-50 border"><span className="text-xl font-bold">{mailStatus.total}</span><p className="text-xs text-slate-500">Total</p></div>
            <div className="p-3 rounded-xl bg-sky-50 border border-sky-100"><span className="text-xl font-bold text-sky-600">{mailStatus.pending + mailStatus.sending}</span><p className="text-xs text-sky-700">Queueing / Sending</p></div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100"><span className="text-xl font-bold text-emerald-600">{mailStatus.sent}</span><p className="text-xs text-emerald-700">Delivered</p></div>
            <div className="p-3 rounded-xl bg-red-50 border border-red-100"><span className="text-xl font-bold text-red-600">{mailStatus.failed}</span><p className="text-xs text-red-700">Failed</p></div>
            <div className="p-3 rounded-xl bg-slate-50 border"><span className="text-xl font-bold text-slate-400">{mailStatus.skipped}</span><p className="text-xs text-slate-500">Skipped (No Email)</p></div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="p-2">Roll No</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Error / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {mailStatus.students?.map((s: any) => (
                  <tr key={s.studentId}>
                    <td className="p-2 font-mono font-bold">{s.rollNo}</td>
                    <td className="p-2">{s.name}</td>
                    <td className="p-2 text-slate-500">{s.email || '—'}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded-full uppercase font-bold text-[10px] ${
                        s.status === 'sent' ? 'bg-emerald-100 text-emerald-800' :
                        s.status === 'failed' ? 'bg-red-100 text-red-800' :
                        s.status === 'sending' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="p-2 text-red-500 truncate max-w-xs">{s.lastError || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Student Drilldown Drawer */}
      {selectedStudentId && studentAnalysis && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between pb-4 border-b">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{studentAnalysis.studentName}</h3>
                <p className="text-xs font-mono text-slate-500">Roll No: {studentAnalysis.rollNo}</p>
              </div>
              <div className="flex items-center space-x-3">
                <a
                  href={`/api/admin/exams/${selectedExamId}/students/${selectedStudentId}/report.pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-bold"
                >
                  Download PDF
                </a>
                <button onClick={() => setSelectedStudentId(null)} className="text-xl font-bold p-1">×</button>
              </div>
            </div>

            {/* Score Box */}
            <div className="bg-slate-50 p-4 rounded-xl border flex justify-between items-center text-center">
              <div><span className="text-xs text-slate-400">Assignment</span><p className="text-lg font-bold">{studentAnalysis.assignmentMarks} / 25</p></div>
              <div><span className="text-xs text-slate-400">Scaled Exam</span><p className="text-lg font-bold">{studentAnalysis.examScaled.toFixed(2)} / 75</p></div>
              <div><span className="text-xs text-slate-400">Total</span><p className="text-2xl font-black text-sky-600">{studentAnalysis.total.toFixed(2)}</p></div>
              <div><span className="text-xs text-slate-400">Tier</span><p className="text-sm font-bold text-emerald-600">{studentAnalysis.gradeLabel}</p></div>
            </div>

            {/* Focus Areas */}
            {studentAnalysis.focusAreas?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 text-sm">Key Weak Topics</h4>
                <div className="space-y-1">
                  {studentAnalysis.focusAreas.map((f: any, i: number) => (
                    <div key={i} className="text-xs bg-red-50 text-red-700 p-2 rounded border border-red-100 flex justify-between">
                      <span>• {f.recommendation}</span>
                      <span className="font-bold">{f.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Wrong Questions */}
            {studentAnalysis.wrongQuestions?.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-bold text-slate-800 text-sm">Wrong Questions Review</h4>
                <div className="space-y-3">
                  {studentAnalysis.wrongQuestions.map((w: any, i: number) => (
                    <div key={i} className="p-3 bg-slate-50 rounded-xl border space-y-1 text-xs">
                      <p className="font-semibold text-slate-800">Q{i + 1}. [{w.topic}] {w.bodyMd}</p>
                      <p className="text-red-600">Student chosen: {w.studentAnswer ? `Option ${w.studentAnswer.toUpperCase()}` : 'Unanswered'}</p>
                      <p className="text-emerald-700 font-bold">Correct: Option {w.correctAnswer.toUpperCase()}</p>
                      {w.explanationMd && <p className="text-slate-500">Explanation: {w.explanationMd}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scoring Config Modal */}
      {showScoringModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleUpdateScoring} className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl border">
            <h3 className="text-lg font-bold text-slate-800">Update Scoring Configuration</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assignment Marks (out of 25)</label>
              <input
                type="number"
                min={0}
                max={25}
                required
                value={assignmentMarksInput}
                onChange={e => setAssignmentMarksInput(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
              <p className="text-xs text-slate-500 mt-1">Updates mock NPTEL assignment marks and immediately recomputes all grades.</p>
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button type="button" onClick={() => setShowScoringModal(false)} className="px-3 py-1.5 text-sm text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-1.5 bg-sky-600 text-white rounded-lg text-sm font-bold">Update & Recompute</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
