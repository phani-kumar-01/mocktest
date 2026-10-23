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
  const [searchTerm, setSearchTerm] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

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
    enabled: !!selectedExamId && (activeTab === 'heatmap' || activeTab === 'table' || activeTab === 'charts')
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
  const rawRows = resultsData?.rows || [];

  // Filter rows by search term, status, or topic weakness
  const filteredRows = rawRows.filter((r: any) => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!r.rollNo.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q)) {
        return false;
      }
    }
    if (statusFilter === 'passed' && !r.passed) return false;
    if (statusFilter === 'failed' && r.passed) return false;

    if (topicFilter) {
      const hasWeakness = r.leftToLearnTopics?.some((t: string) => t.toLowerCase() === topicFilter.toLowerCase());
      const isGood = r.goodAtTopics?.some((t: string) => t.toLowerCase() === topicFilter.toLowerCase());
      if (!hasWeakness && !isGood) return false;
    }
    return true;
  });

  const allTopics = matrixData?.topics || [];

  return (
    <div className="space-y-6 bg-white text-black">
      {/* Header & Exam Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-black">Student Performance & Sub-Analytics</h1>
          <p className="text-neutral-600 text-sm">Automated evaluation: student mastery, topics good at, and topics left to learn</p>
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
          Student Analytics Table ({rawRows.length})
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

      {/* Tab 1: Student Analytics Table with Good At & Left to Learn topics */}
      {activeTab === 'table' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-neutral-50 border border-black rounded">
            <div className="flex items-center space-x-3 flex-1 max-w-lg">
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by student name or roll number..."
                className="w-full px-3.5 py-1.5 border border-black rounded text-xs bg-white text-black"
              />
            </div>

            <div className="flex items-center space-x-3">
              <select
                value={topicFilter}
                onChange={e => setTopicFilter(e.target.value)}
                className="px-3 py-1.5 border border-black rounded text-xs bg-white text-black font-semibold"
              >
                <option value="">All Topics</option>
                {allTopics.map((t: string) => (
                  <option key={t} value={t}>Topic: {t}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 border border-black rounded text-xs bg-white text-black font-semibold"
              >
                <option value="">All Results</option>
                <option value="passed">Passed Only</option>
                <option value="failed">Not Passed Only</option>
              </select>

              <span className="text-xs text-neutral-600 font-bold">Showing {filteredRows.length} / {rawRows.length}</span>
            </div>
          </div>

          <div className="bg-white rounded border border-black overflow-hidden">
            <table className="w-full text-left text-xs text-black">
              <thead className="bg-neutral-100 text-xs text-black font-bold border-b border-black uppercase">
                <tr>
                  <th className="py-3 px-3">Roll No</th>
                  <th className="py-3 px-3">Student Name</th>
                  <th className="py-3 px-2 text-center">Score</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-4 min-w-[200px]">🏆 Topics Good At (Mastered)</th>
                  <th className="py-3 px-4 min-w-[220px]">⚠️ Left to Learn (Needs Revision)</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y border-b border-black">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-neutral-500 font-bold">
                      No student results found matching filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((r: any) => (
                    <tr key={r.studentId} className="hover:bg-neutral-50">
                      <td className="py-3 px-3 font-mono font-bold text-black">{r.rollNo}</td>
                      <td className="py-3 px-3 font-semibold text-black">
                        <div>{r.name}</div>
                        <div className="text-[10px] text-neutral-500">{r.correctCount} Correct, {r.wrongCount} Wrong, {r.unansweredCount} Left</div>
                      </td>
                      <td className="py-3 px-2 text-center font-mono font-bold text-sm">
                        {r.total.toFixed(1)} <span className="text-[10px] text-neutral-500 font-normal">/ 100</span>
                      </td>
                      <td className="py-3 px-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border border-black uppercase ${r.passed ? 'bg-black text-white' : 'bg-neutral-100 text-black'}`}>
                          {r.passed ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {r.goodAtTopics && r.goodAtTopics.length > 0 ? (
                            r.goodAtTopics.map((topic: string) => (
                              <span
                                key={topic}
                                className="px-2 py-0.5 rounded bg-black text-white font-semibold text-[11px] inline-flex items-center"
                              >
                                ✓ {topic}
                              </span>
                            ))
                          ) : (
                            <span className="text-neutral-400 italic text-[11px]">— No topics above 70%</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1.5">
                          {r.leftToLearnTopics && r.leftToLearnTopics.length > 0 ? (
                            r.leftToLearnTopics.map((topic: string) => (
                              <span
                                key={topic}
                                className="px-2 py-0.5 rounded bg-neutral-100 text-black border border-black font-semibold text-[11px] inline-flex items-center"
                              >
                                ⚠ {topic}
                              </span>
                            ))
                          ) : (
                            <span className="text-black font-bold text-[11px]">✓ Mastered all topics!</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => setSelectedStudentId(r.studentId)}
                          className="px-2.5 py-1 bg-white hover:bg-neutral-100 border border-black text-black text-xs font-bold rounded shadow-none"
                        >
                          Detailed Report →
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Topic Mastery Heatmap */}
      {activeTab === 'heatmap' && matrixData && (
        <div className="bg-white rounded border border-black p-5 space-y-4">
          <div className="flex items-center justify-between text-xs text-neutral-600 pb-2 border-b border-black font-semibold">
            <span>Guide: Black (≥70% Strong - Good At), Gray (50–69% Average), White/Light (&lt;50% Weak - Left to Learn).</span>
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

      {/* Complete Student Sub-Analytics Drilldown Drawer */}
      {selectedStudentId && studentAnalysis && (
        <div className="fixed inset-0 z-50 bg-black/60 flex justify-end">
          <div className="bg-white w-full max-w-3xl h-full border-l-2 border-black p-6 overflow-y-auto space-y-6 text-black">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-black">
              <div>
                <h3 className="text-xl font-black text-black uppercase tracking-tight">{studentAnalysis.studentName}</h3>
                <p className="text-xs font-mono text-neutral-600">Roll No: {studentAnalysis.rollNo} | Exam: {studentAnalysis.examTitle}</p>
              </div>
              <div className="flex items-center space-x-3">
                <a
                  href={`/api/admin/exams/${selectedExamId}/students/${selectedStudentId}/report.pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-1.5 bg-black text-white rounded text-xs font-bold border border-black hover:bg-neutral-800 transition-colors"
                >
                  📄 Download PDF
                </a>
                <button onClick={() => setSelectedStudentId(null)} className="text-xl font-bold p-1 hover:text-neutral-500">✕</button>
              </div>
            </div>

            {/* Score Summary Box */}
            <div className="bg-neutral-50 p-4 rounded border border-black grid grid-cols-4 gap-2 text-center">
              <div><span className="text-[11px] text-neutral-500 uppercase font-bold">Assignment</span><p className="text-base font-bold text-black">{studentAnalysis.assignmentMarks} / 25</p></div>
              <div><span className="text-[11px] text-neutral-500 uppercase font-bold">Scaled Exam</span><p className="text-base font-bold text-black">{studentAnalysis.examScaled.toFixed(2)} / 75</p></div>
              <div><span className="text-[11px] text-neutral-500 uppercase font-bold">Total Score</span><p className="text-2xl font-black text-black">{studentAnalysis.total.toFixed(2)}</p></div>
              <div><span className="text-[11px] text-neutral-500 uppercase font-bold">Grade & Status</span><p className="text-xs font-bold text-black uppercase mt-1">{studentAnalysis.passed ? '✓ PASSED' : '✕ FAILED'}</p><p className="text-[11px] text-neutral-600 font-semibold">{studentAnalysis.gradeLabel}</p></div>
            </div>

            {/* 1. WHAT TOPICS DID HE GOOD AT (Mastered Topics) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-black text-sm uppercase flex items-center">
                  <span className="w-2.5 h-2.5 rounded-full bg-black mr-2"></span>
                  🏆 Topics Good At (Mastered / High Performance)
                </h4>
                <span className="text-xs font-bold text-neutral-600">{studentAnalysis.goodAtTopics?.length || 0} Topics</span>
              </div>

              {studentAnalysis.goodAtTopics && studentAnalysis.goodAtTopics.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {studentAnalysis.goodAtTopics.map((g: any, i: number) => (
                    <div key={i} className="p-3 bg-neutral-900 text-white rounded border border-black flex items-center justify-between">
                      <div>
                        <p className="font-bold text-xs uppercase text-white">{g.topic}</p>
                        {g.subtopic && <p className="text-[11px] text-neutral-300">{g.subtopic}</p>}
                        <p className="text-[10px] text-neutral-400 mt-1">{g.correct} of {g.total} correct</p>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-black text-white">{g.pct.toFixed(0)}%</span>
                        <span className="block text-[10px] text-neutral-300 font-bold uppercase">Strong</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-neutral-100 rounded border border-black text-xs text-neutral-600 italic">
                  No topics reached the 70% mastery threshold. Needs general revision across the syllabus.
                </div>
              )}
            </div>

            {/* 2. WHAT HE LEFT LEARN (Topics Left to Learn / Weak Areas) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-black text-sm uppercase flex items-center">
                  <span className="w-2.5 h-2.5 rounded-full bg-neutral-400 mr-2"></span>
                  ⚠️ What He Left to Learn (Needs Revision & Practice)
                </h4>
                <span className="text-xs font-bold text-neutral-600">{studentAnalysis.leftToLearnTopics?.length || 0} Areas</span>
              </div>

              {studentAnalysis.leftToLearnTopics && studentAnalysis.leftToLearnTopics.length > 0 ? (
                <div className="space-y-2">
                  {studentAnalysis.leftToLearnTopics.map((l: any, i: number) => (
                    <div key={i} className="p-3 bg-white text-black rounded border border-black flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="font-bold text-xs uppercase text-black">{l.topic} {l.subtopic ? `→ ${l.subtopic}` : ''}</p>
                        <p className="text-xs text-neutral-600 font-medium">{l.recommendation}</p>
                        <p className="text-[10px] text-neutral-500">{l.correct} of {l.total} questions answered correctly</p>
                      </div>
                      <div className="text-right pl-4">
                        <span className={`text-base font-black ${l.pct < 50 ? 'text-black font-extrabold' : 'text-neutral-700'}`}>
                          {l.pct.toFixed(0)}%
                        </span>
                        <span className="block text-[10px] uppercase font-bold text-neutral-500">
                          {l.pct < 50 ? 'Critical' : 'Moderate'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 bg-neutral-100 rounded border border-black text-xs text-black font-bold">
                  ✓ Perfect topic coverage! No weak areas identified.
                </div>
              )}
            </div>

            {/* 3. Comprehensive Topic Breakdown Table */}
            <div className="space-y-3">
              <h4 className="font-bold text-black text-sm uppercase">Full Topic-by-Topic Sub-Analytics</h4>
              <div className="border border-black rounded overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-neutral-100 font-bold border-b border-black uppercase">
                    <tr>
                      <th className="p-2">Topic</th>
                      <th className="p-2">Subtopic</th>
                      <th className="p-2 text-center">Correct / Total</th>
                      <th className="p-2 text-center">Score %</th>
                      <th className="p-2 text-right">Mastery Level</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y border-b border-black">
                    {studentAnalysis.topicScores?.map((ts: any, i: number) => (
                      <tr key={i} className="hover:bg-neutral-50">
                        <td className="p-2 font-bold text-black">{ts.topic}</td>
                        <td className="p-2 text-neutral-600">{ts.subtopic || '—'}</td>
                        <td className="p-2 text-center font-mono">{ts.correct} / {ts.total}</td>
                        <td className="p-2 text-center font-mono font-bold">{ts.pct.toFixed(0)}%</td>
                        <td className="p-2 text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-black ${
                            ts.level === 'strong'
                              ? 'bg-black text-white'
                              : ts.level === 'weak'
                              ? 'bg-neutral-100 text-black'
                              : 'bg-neutral-200 text-black'
                          }`}>
                            {ts.level}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. Missed & Unanswered Questions Review */}
            {studentAnalysis.wrongQuestions?.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-bold text-black text-sm uppercase">
                  Missed / Left Unanswered Questions ({studentAnalysis.wrongQuestions.length})
                </h4>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {studentAnalysis.wrongQuestions.map((w: any, i: number) => (
                    <div key={i} className="p-3 bg-neutral-50 rounded border border-black space-y-1.5 text-xs">
                      <div className="flex justify-between font-bold text-black">
                        <span>Q{i + 1}. Topic: {w.topic} {w.subtopic ? `(${w.subtopic})` : ''}</span>
                        <span className={w.studentAnswer ? 'text-black' : 'text-neutral-500'}>
                          {w.studentAnswer ? `Answered: [${w.studentAnswer.toUpperCase()}]` : 'Left Unanswered'}
                        </span>
                      </div>
                      <p className="text-neutral-900 leading-relaxed">{w.bodyMd}</p>
                      {w.codeSnippet && (
                        <pre className="p-2 bg-white rounded border border-neutral-300 font-mono text-[11px] overflow-x-auto">
                          {w.codeSnippet}
                        </pre>
                      )}
                      <p className="font-bold text-black">✓ Correct Answer: Option {w.correctAnswer.toUpperCase()}</p>
                      {w.explanationMd && (
                        <p className="text-neutral-600 italic">Explanation: {w.explanationMd}</p>
                      )}
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
