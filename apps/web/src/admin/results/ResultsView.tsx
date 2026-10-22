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
    <div className="space-y-6 bg-white text-black">
      {/* Header & Exam Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-black">Results & Analytics</h1>
          <p className="text-neutral-600 text-sm">NPTEL scoring, grade tier distribution, and topic mastery</p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedExamId}
            onChange={(e) => setSearchParams({ examId: e.target.value })}
            className="px-3.5 py-2 border border-black rounded text-sm bg-white font-bold text-black"
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
            className="px-4 py-2 bg-white border border-black text-black font-bold rounded text-sm hover:bg-neutral-100 flex items-center space-x-1"
          >
            <span>📊</span>
            <span>Export Excel</span>
          </a>

          <button
            onClick={() => setShowScoringModal(true)}
            className="px-3.5 py-2 bg-white border border-black text-black font-bold rounded text-sm hover:bg-neutral-100"
          >
            ⚙ Scoring Config
          </button>

          <button
            onClick={handlePublishMails}
            disabled={isPublishing}
            className="px-4 py-2 bg-black hover:bg-neutral-800 disabled:bg-neutral-400 text-white font-bold rounded text-sm border border-black transition-colors"
          >
            {isPublishing ? 'Publishing...' : '✉ Publish & Send Mails'}
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          <div className="bg-white p-4 rounded border border-black">
            <span className="text-xs font-bold uppercase text-neutral-500">Total Attempts</span>
            <p className="text-2xl font-black text-black mt-1">{summary.totalAttempts}</p>
          </div>
          <div className="bg-white p-4 rounded border border-black">
            <span className="text-xs font-bold uppercase text-neutral-500">Pass Rate</span>
            <p className="text-2xl font-black text-black mt-1">{summary.passRate}%</p>
          </div>
          <div className="bg-white p-4 rounded border border-black">
            <span className="text-xs font-bold uppercase text-neutral-500">Passed / Failed</span>
            <p className="text-xl font-black text-black mt-1">{summary.passedCount} / {summary.totalAttempts - summary.passedCount}</p>
          </div>
          <div className="bg-white p-4 rounded border border-black">
            <span className="text-xs font-bold uppercase text-neutral-500">Average Score</span>
            <p className="text-2xl font-black text-black mt-1">{summary.avgTotal}</p>
          </div>
          <div className="bg-white p-4 rounded border border-black">
            <span className="text-xs font-bold uppercase text-neutral-500">Median Score</span>
            <p className="text-2xl font-black text-black mt-1">{summary.medianTotal}</p>
          </div>
          <div className="bg-white p-4 rounded border border-black">
            <span className="text-xs font-bold uppercase text-neutral-500">Highest / Lowest</span>
            <p className="text-xl font-black text-black mt-1">{summary.highestTotal} / {summary.lowestTotal}</p>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-black space-x-6 text-sm font-bold">
        <button
          onClick={() => setActiveTab('table')}
          className={`pb-3 transition-colors ${activeTab === 'table' ? 'border-b-2 border-black text-black' : 'text-neutral-500 hover:text-black'}`}
        >
          Results Table ({rows.length})
        </button>
        <button
          onClick={() => setActiveTab('heatmap')}
          className={`pb-3 transition-colors ${activeTab === 'heatmap' ? 'border-b-2 border-black text-black' : 'text-neutral-500 hover:text-black'}`}
        >
          Topic Mastery Heatmap
        </button>
        <button
          onClick={() => setActiveTab('charts')}
          className={`pb-3 transition-colors ${activeTab === 'charts' ? 'border-b-2 border-black text-black' : 'text-neutral-500 hover:text-black'}`}
        >
          Distribution & Class Weaknesses
        </button>
        <button
          onClick={() => setActiveTab('mail')}
          className={`pb-3 transition-colors ${activeTab === 'mail' ? 'border-b-2 border-black text-black' : 'text-neutral-500 hover:text-black'}`}
        >
          Email Queue Tracker
        </button>
      </div>

      {/* Tab 1: Results Table */}
      {activeTab === 'table' && (
        <div className="bg-white rounded border border-black overflow-hidden">
          <table className="w-full text-left text-sm text-black">
            <thead className="bg-neutral-100 text-xs text-black font-bold border-b border-black uppercase">
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
            <tbody className="divide-y border-b border-black">
              {rows.map((r: any) => (
                <tr key={r.studentId} className="hover:bg-neutral-50">
                  <td className="py-3 px-4 font-mono font-bold text-black">{r.rollNo}</td>
                  <td className="py-3 px-4 font-medium text-black">{r.name}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="text-black font-bold">{r.correctCount}</span>
                    <span className="text-neutral-400 mx-1">/</span>
                    <span className="text-black font-semibold">{r.wrongCount}</span>
                  </td>
                  <td className="py-3 px-4 font-mono">{r.examScaled.toFixed(2)}</td>
                  <td className="py-3 px-4 font-mono">{r.assignmentMarks}</td>
                  <td className="py-3 px-4 font-mono font-bold text-black text-base">{r.total.toFixed(2)}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded border border-black uppercase ${r.passed ? 'bg-black text-white' : 'bg-neutral-100 text-black'}`}>
                      {r.passed ? 'PASSED' : 'NOT PASSED'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs font-semibold text-black">{r.gradeLabel}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setSelectedStudentId(r.studentId)}
                      className="text-xs text-black hover:text-neutral-600 font-bold underline"
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
        <div className="bg-white rounded border border-black p-5 space-y-4">
          <div className="flex items-center justify-between text-xs text-neutral-600 pb-2 border-b border-black font-semibold">
            <span>Guide: Black (≥70% Strong), Gray (50–69% Average), White/Light (&lt;50% Weak).</span>
            <span>{matrixData.rows?.length} Students × {matrixData.topics?.length} Topics</span>
          </div>

          <div className="overflow-x-auto max-h-[600px] overflow-y-auto border border-black">
            <table className="w-full text-xs text-center border-collapse">
              <thead className="bg-neutral-100 sticky top-0 z-10 font-bold text-black border-b border-black">
                <tr>
                  <th className="p-2 text-left sticky left-0 bg-neutral-100 min-w-[120px] border-r border-black">Roll Number</th>
                  {matrixData.topics.map((t: string) => (
                    <th key={t} className="p-2 min-w-[90px] border-r border-black">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y border-b border-black">
                {matrixData.rows.map((row: any) => (
                  <tr key={row.studentId}>
                    <td className="p-2 text-left font-mono font-bold sticky left-0 bg-white border-r border-black">
                      {row.rollNo}
                    </td>
                    {matrixData.topics.map((topic: string) => {
                      const score = row.scores[topic];
                      if (!score) return <td key={topic} className="p-2 text-neutral-400 border-r border-neutral-200">—</td>;

                      let cellBg = 'bg-neutral-200 text-black font-semibold';
                      if (score.level === 'strong') cellBg = 'bg-black text-white font-bold';
                      if (score.level === 'weak') cellBg = 'bg-neutral-50 text-neutral-600';

                      return (
                        <td key={topic} className={`p-2 border-r border-neutral-200 ${cellBg}`}>
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
          <div className="bg-white p-6 rounded border border-black space-y-3">
            <h4 className="font-bold text-black text-base uppercase">Score Distribution</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.distribution}>
                  <XAxis dataKey="bin" stroke="#000000" />
                  <YAxis stroke="#000000" />
                  <Tooltip />
                  <Bar dataKey="count" fill="#000000" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded border border-black space-y-3">
            <h4 className="font-bold text-black text-base uppercase">Class Weak Topics (Lowest Average %)</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={matrixData?.classWeak || []} layout="vertical">
                  <XAxis type="number" domain={[0, 100]} stroke="#000000" />
                  <YAxis type="category" dataKey="topic" width={110} stroke="#000000" />
                  <Tooltip />
                  <Bar dataKey="avgPct" fill="#000000">
                    {(matrixData?.classWeak || []).map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.avgPct < 50 ? '#737373' : '#000000'} />
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
        <div className="bg-white rounded border border-black p-6 space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-black">
            <div>
              <h3 className="font-bold text-black text-lg uppercase">Result Dispatch & Email Queue</h3>
              <p className="text-xs text-neutral-600">Live background worker status sending PDF report attachments</p>
            </div>

            <button
              onClick={handleRetryFailedMails}
              className="px-4 py-2 bg-black hover:bg-neutral-800 text-white font-bold text-xs rounded border border-black"
            >
              ↺ Retry Failed Sends
            </button>
          </div>

          {/* Counts */}
          <div className="grid grid-cols-5 gap-3 text-center">
            <div className="p-3 rounded bg-white border border-black"><span className="text-xl font-bold">{mailStatus.total}</span><p className="text-xs text-neutral-500 uppercase font-semibold">Total</p></div>
            <div className="p-3 rounded bg-neutral-100 border border-black"><span className="text-xl font-bold text-black">{mailStatus.pending + mailStatus.sending}</span><p className="text-xs text-black uppercase font-semibold">Queueing / Sending</p></div>
            <div className="p-3 rounded bg-black text-white border border-black"><span className="text-xl font-bold text-white">{mailStatus.sent}</span><p className="text-xs text-neutral-300 uppercase font-semibold">Delivered</p></div>
            <div className="p-3 rounded bg-neutral-200 border border-black"><span className="text-xl font-bold text-black">{mailStatus.failed}</span><p className="text-xs text-black uppercase font-semibold">Failed</p></div>
            <div className="p-3 rounded bg-white border border-black"><span className="text-xl font-bold text-neutral-400">{mailStatus.skipped}</span><p className="text-xs text-neutral-500 uppercase font-semibold">Skipped</p></div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-96 border border-black rounded">
            <table className="w-full text-left text-xs text-black">
              <thead className="bg-neutral-100 border-b border-black uppercase font-bold">
                <tr>
                  <th className="p-2">Roll No</th>
                  <th className="p-2">Name</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Error / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y border-b border-black">
                {mailStatus.students?.map((s: any) => (
                  <tr key={s.studentId}>
                    <td className="p-2 font-mono font-bold">{s.rollNo}</td>
                    <td className="p-2">{s.name}</td>
                    <td className="p-2 text-neutral-600">{s.email || '—'}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded uppercase font-bold text-[10px] border border-black ${
                        s.status === 'sent' ? 'bg-black text-white' : 'bg-neutral-100 text-black'
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="p-2 text-neutral-600 truncate max-w-xs">{s.lastError || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Student Drilldown Drawer */}
      {selectedStudentId && studentAnalysis && (
        <div className="fixed inset-0 z-50 bg-black/60 flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full border-l-2 border-black p-6 overflow-y-auto space-y-6 text-black">
            <div className="flex items-center justify-between pb-4 border-b border-black">
              <div>
                <h3 className="text-xl font-bold text-black uppercase">{studentAnalysis.studentName}</h3>
                <p className="text-xs font-mono text-neutral-600">Roll No: {studentAnalysis.rollNo}</p>
              </div>
              <div className="flex items-center space-x-3">
                <a
                  href={`/api/admin/exams/${selectedExamId}/students/${selectedStudentId}/report.pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-black text-white rounded text-xs font-bold border border-black hover:bg-neutral-800"
                >
                  Download PDF
                </a>
                <button onClick={() => setSelectedStudentId(null)} className="text-xl font-bold p-1">✕</button>
              </div>
            </div>

            {/* Score Box */}
            <div className="bg-neutral-50 p-4 rounded border border-black flex justify-between items-center text-center">
              <div><span className="text-xs text-neutral-500 uppercase font-bold">Assignment</span><p className="text-lg font-bold">{studentAnalysis.assignmentMarks} / 25</p></div>
              <div><span className="text-xs text-neutral-500 uppercase font-bold">Scaled Exam</span><p className="text-lg font-bold">{studentAnalysis.examScaled.toFixed(2)} / 75</p></div>
              <div><span className="text-xs text-neutral-500 uppercase font-bold">Total</span><p className="text-2xl font-black text-black">{studentAnalysis.total.toFixed(2)}</p></div>
              <div><span className="text-xs text-neutral-500 uppercase font-bold">Tier</span><p className="text-sm font-bold text-black">{studentAnalysis.gradeLabel}</p></div>
            </div>

            {/* Focus Areas */}
            {studentAnalysis.focusAreas?.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-bold text-black text-sm uppercase">Key Weak Topics</h4>
                <div className="space-y-1">
                  {studentAnalysis.focusAreas.map((f: any, i: number) => (
                    <div key={i} className="text-xs bg-white text-black p-2 rounded border border-black flex justify-between">
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
                <h4 className="font-bold text-black text-sm uppercase">Wrong Questions Review</h4>
                <div className="space-y-3">
                  {studentAnalysis.wrongQuestions.map((w: any, i: number) => (
                    <div key={i} className="p-3 bg-neutral-50 rounded border border-black space-y-1 text-xs">
                      <p className="font-bold text-black">Q{i + 1}. [{w.topic}] {w.bodyMd}</p>
                      <p className="text-neutral-700">Student chosen: {w.studentAnswer ? `Option ${w.studentAnswer.toUpperCase()}` : 'Unanswered'}</p>
                      <p className="text-black font-bold">Correct: Option {w.correctAnswer.toUpperCase()}</p>
                      {w.explanationMd && <p className="text-neutral-600">Explanation: {w.explanationMd}</p>}
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
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleUpdateScoring} className="bg-white rounded max-w-sm w-full p-6 space-y-4 border-2 border-black">
            <h3 className="text-lg font-bold text-black uppercase">Update Scoring Configuration</h3>
            <div>
              <label className="block text-xs font-bold uppercase text-black mb-1">Assignment Marks (out of 25)</label>
              <input
                type="number"
                min={0}
                max={25}
                required
                value={assignmentMarksInput}
                onChange={e => setAssignmentMarksInput(Number(e.target.value))}
                className="w-full px-3 py-2 border border-black rounded text-sm text-black"
              />
              <p className="text-xs text-neutral-600 mt-1">Updates mock NPTEL assignment marks and immediately recomputes all grades.</p>
            </div>
            <div className="flex justify-end space-x-2 pt-2 border-t border-black">
              <button type="button" onClick={() => setShowScoringModal(false)} className="px-3 py-1.5 text-sm text-black border border-neutral-300 rounded hover:bg-neutral-100">Cancel</button>
              <button type="submit" className="px-4 py-1.5 bg-black text-white rounded text-sm font-bold border border-black hover:bg-neutral-800">Update & Recompute</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
