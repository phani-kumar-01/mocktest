import { useState, ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';

export default function ExamsView() {
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState<string | null>(null);
  const [extendMinutes, setExtendMinutes] = useState(10);
  const [restartModalExam, setRestartModalExam] = useState<any | null>(null);
  const [restartMode, setRestartMode] = useState<'separate' | 'merge'>('separate');
  const [restartTitle, setRestartTitle] = useState('');
  const [isRestarting, setIsRestarting] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [isCreatingNewSubject, setIsCreatingNewSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelStatus, setExcelStatus] = useState<string | null>(null);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [questionsPerStudent, setQuestionsPerStudent] = useState(50);
  const [joinPolicy, setJoinPolicy] = useState<'FIXED_END' | 'FULL_DURATION'>('FIXED_END');
  const [lateJoinCutoff, setLateJoinCutoff] = useState<number | ''>('');
  const [assignmentMarks, setAssignmentMarks] = useState(20);
  const [batchFilter, setBatchFilter] = useState('');
  const [requireSafeBrowser, setRequireSafeBrowser] = useState(true);

  // Fetch exams
  const { data: exams = [], refetch: refetchExams, isLoading } = useQuery({
    queryKey: ['adminExams'],
    queryFn: () => api.get('/admin/exams')
  });

  // Fetch subjects
  const { data: subjects = [], refetch: refetchSubjects } = useQuery({
    queryKey: ['adminSubjects'],
    queryFn: async () => {
      const list = await api.get('/admin/subjects');
      if (list.length > 0 && !subjectId) setSubjectId(list[0].id);
      return list;
    }
  });

  const handleDownloadTemplate = async () => {
    try {
      const blob = await api.get('/admin/questions/template.xlsx');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'questions_template.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Failed to download template: ' + (err.message || ''));
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setExcelFile(file);
    setExcelStatus(null);
    setExcelError(null);
    if (file) {
      setExcelStatus(`Selected file: ${file.name} (${Math.round(file.size / 1024)} KB)`);
    }
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setExcelError(null);

    try {
      let targetSubjectId = subjectId;

      // 1. Create subject if specified
      if (isCreatingNewSubject || (!targetSubjectId && newSubjectName)) {
        if (!newSubjectName.trim()) {
          throw new Error('Please enter a subject name');
        }
        const createdSub = await api.post('/admin/subjects', { name: newSubjectName.trim() });
        targetSubjectId = createdSub.id;
        await refetchSubjects();
      } else if (!targetSubjectId && subjects.length > 0) {
        targetSubjectId = subjects[0].id;
      }

      if (!targetSubjectId) {
        throw new Error('Please select or create a subject');
      }

      // 2. Upload and import questions Excel if provided
      if (excelFile) {
        setExcelStatus('Uploading and validating questions spreadsheet...');
        const fd = new FormData();
        fd.append('file', excelFile);
        fd.append('subjectId', targetSubjectId);

        const previewRes = await api.post('/admin/questions/import', fd);

        if (previewRes.validCount === 0) {
          const firstErr = previewRes.errors?.[0]?.message || 'No valid questions found in Excel file';
          throw new Error(`Excel validation error: ${firstErr}`);
        }

        setExcelStatus(`Importing ${previewRes.validCount} valid questions...`);
        await api.post('/admin/questions/import/confirm', { token: previewRes.token });
      }

      // 3. Create exam
      setExcelStatus('Creating exam record...');
      const created = await api.post('/admin/exams', {
        title,
        subjectId: targetSubjectId,
        durationMinutes,
        questionsPerStudent,
        joinPolicy,
        lateJoinCutoffMinutes: lateJoinCutoff !== '' ? Number(lateJoinCutoff) : null,
        assignmentMarks,
        batchFilter: batchFilter || null,
        requireSafeBrowser
      });

      // 4. Assign questions to exam pool
      setExcelStatus('Linking questions to exam pool...');
      await api.put(`/admin/exams/${created.id}/questions`, { subjectId: targetSubjectId });

      // Reset and close
      setShowCreateModal(false);
      setTitle('');
      setExcelFile(null);
      setExcelStatus(null);
      setIsCreatingNewSubject(false);
      setNewSubjectName('');
      refetchExams();
    } catch (err: any) {
      setExcelError(err.message || 'Failed to create exam');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartExam = async (id: string) => {
    if (!confirm('Start this exam now? Students will immediately see the Enter button.')) return;
    try {
      await api.post(`/admin/exams/${id}/start`);
      refetchExams();
    } catch (err: any) {
      alert(err.message || 'Failed to start exam');
    }
  };

  const handleStopExam = async (id: string) => {
    if (!confirm('Stop this exam? All in-progress student attempts will be auto-submitted immediately.')) return;
    try {
      await api.post(`/admin/exams/${id}/stop`);
      refetchExams();
    } catch (err: any) {
      alert(err.message || 'Failed to stop exam');
    }
  };

  const handleExtendExam = async (id: string) => {
    try {
      await api.post(`/admin/exams/${id}/extend`, { minutes: extendMinutes });
      setShowExtendModal(null);
      refetchExams();
    } catch (err: any) {
      alert(err.message || 'Failed to extend exam');
    }
  };

  const handleRestartExam = async () => {
    if (!restartModalExam) return;
    setIsRestarting(true);
    try {
      await api.post(`/admin/exams/${restartModalExam.id}/restart`, {
        mode: restartMode,
        title: restartTitle.trim() || undefined
      });
      setRestartModalExam(null);
      refetchExams();
    } catch (err: any) {
      alert(err.message || 'Failed to restart exam');
    } finally {
      setIsRestarting(false);
    }
  };

  return (
    <div className="space-y-6 text-black bg-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-black">Exam Management & Control</h1>
          <p className="text-neutral-600 text-sm">Configure schedules, questions Excel files, join policies, and live controls</p>
        </div>

        <button
          onClick={() => {
            setShowCreateModal(true);
            setExcelError(null);
            setExcelStatus(null);
          }}
          className="px-4 py-2 bg-black hover:bg-neutral-800 text-white font-bold rounded text-sm transition-colors"
        >
          + Create New Exam
        </button>
      </div>

      {/* Exam List Cards */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white p-8 text-center text-neutral-500 rounded border border-black">Loading exams...</div>
        ) : exams.length === 0 ? (
          <div className="bg-white p-8 text-center text-neutral-500 rounded border border-black">
            No exams created yet. Click "+ Create New Exam" to begin.
          </div>
        ) : (
          exams.map((exam: any) => {
            const isLive = exam.status === 'live';
            const isDraft = exam.status === 'draft';
            const isEnded = exam.status === 'ended';

            let badgeClass = 'bg-neutral-100 text-black border-neutral-400';
            if (isLive) badgeClass = 'bg-black text-white border-black font-extrabold';
            if (isEnded) badgeClass = 'bg-neutral-200 text-neutral-800 border-neutral-400';

            return (
              <div key={exam.id} className="bg-white rounded border border-black p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-200 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-lg font-bold text-black">{exam.title}</h3>
                      {exam.instanceNumber && exam.instanceNumber > 1 && (
                        <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-neutral-900 text-white">
                          Run {exam.instanceNumber}
                        </span>
                      )}
                      <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded border ${badgeClass}`}>
                        {isLive ? '● LIVE' : exam.status}
                      </span>
                      {exam.requireSafeBrowser !== false && (
                        <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-600">
                          🛡️ Safe Browser
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-600">
                      Duration: {exam.durationMinutes}m {exam.extraMinutes > 0 ? `(+${exam.extraMinutes}m extra)` : ''} | Policy: <span className="font-semibold text-black">{exam.joinPolicy}</span> | Questions: {exam.questionsPerStudent}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2">
                    {isDraft && (
                      <button
                        onClick={() => handleStartExam(exam.id)}
                        className="px-3.5 py-1.5 bg-black hover:bg-neutral-800 text-white font-bold text-xs rounded border border-black transition-colors"
                      >
                        Start Now ▶
                      </button>
                    )}

                    {isLive && (
                      <>
                        <button
                          onClick={() => setShowExtendModal(exam.id)}
                          className="px-3 py-1.5 bg-white hover:bg-neutral-100 text-black font-bold text-xs rounded border border-black transition-colors"
                        >
                          + Extend Time
                        </button>
                        <button
                          onClick={() => handleStopExam(exam.id)}
                          className="px-3 py-1.5 bg-black hover:bg-neutral-800 text-white font-bold text-xs rounded border border-black transition-colors"
                        >
                          Stop Exam ⏹
                        </button>
                      </>
                    )}

                    {/* Restart Exam Option (Supports separate instance or merge) */}
                    {(isLive || isEnded) && (
                      <button
                        onClick={() => {
                          setRestartModalExam(exam);
                          setRestartMode('separate');
                          setRestartTitle('');
                        }}
                        className="px-3 py-1.5 bg-black hover:bg-neutral-800 text-white font-bold text-xs rounded border border-black transition-colors"
                      >
                        Restart Exam 🔄
                      </button>
                    )}

                    <button
                      onClick={() => navigate(`/admin/monitor?examId=${exam.id}`)}
                      className="px-3 py-1.5 bg-white hover:bg-neutral-100 text-black font-semibold text-xs rounded border border-black transition-colors"
                    >
                      Live Monitor
                    </button>

                    <button
                      onClick={() => navigate(`/admin/results?examId=${exam.id}`)}
                      className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-black font-semibold text-xs rounded border border-black transition-colors"
                    >
                      Results
                    </button>
                  </div>
                </div>

                {/* Details Footer */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-neutral-600">
                  <div>Assignment Marks: <span className="font-semibold text-black">{exam.assignmentMarks} / 25</span></div>
                  <div>Batch Filter: <span className="font-semibold text-black">{exam.batchFilter || 'All Students'}</span></div>
                  <div>Pass Threshold: <span className="font-semibold text-black">{exam.passTotal} Marks</span></div>
                  <div>Results: <span className="font-semibold text-black">{exam.resultsPublished ? 'Published' : 'Unpublished'}</span></div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Extend Modal */}
      {showExtendModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-sm w-full p-6 space-y-4 border-2 border-black">
            <h3 className="text-lg font-bold text-black uppercase">Extend Active Exam Time</h3>
            <p className="text-xs text-neutral-600">
              Minutes will be added to the duration and all active in-progress students' deadlines will immediately be extended.
            </p>
            <div className="flex space-x-2">
              {[5, 10, 15, 30].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setExtendMinutes(m)}
                  className={`flex-1 py-2 text-sm font-bold rounded border ${extendMinutes === m ? 'bg-black text-white border-black' : 'bg-white text-black border-neutral-300 hover:bg-neutral-100'}`}
                >
                  +{m}m
                </button>
              ))}
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button onClick={() => setShowExtendModal(null)} className="px-3 py-1.5 text-sm text-black border border-neutral-300 rounded hover:bg-neutral-100">Cancel</button>
              <button onClick={() => handleExtendExam(showExtendModal)} className="px-4 py-1.5 bg-black hover:bg-neutral-800 text-white font-bold rounded text-sm">
                Extend Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restart Exam Modal (Separate Instance vs Merge) */}
      {restartModalExam && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-lg w-full p-6 space-y-5 border-2 border-black">
            <div className="border-b border-black pb-3">
              <h3 className="text-lg font-bold text-black uppercase">Restart Exam: {restartModalExam.title}</h3>
              <p className="text-xs text-neutral-600 mt-1">
                Choose how new exam attempts and results should be handled.
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
                      <strong>Clean isolation:</strong> Creates an independent instance (e.g. Run {(restartModalExam.instanceNumber || 1) + 1}) with a copied question pool. Old test-takers' results and performances are archived and kept completely separate, never colliding with the new examinees.
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
                      <strong>Shared instance:</strong> Reopens this exam so new test-takers can take it. Existing student submissions are preserved and all student results are merged together into this exam instance.
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
                  placeholder={`${restartModalExam.title.replace(/\s*\(Run\s+\d+\)$/i, '')} (Run ${(restartModalExam.instanceNumber || 1) + 1})`}
                  className="w-full px-3 py-2 border border-black rounded text-sm text-black"
                />
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-3 border-t border-black">
              <button
                type="button"
                onClick={() => setRestartModalExam(null)}
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

      {/* Create Exam Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handleCreateExam} className="bg-white rounded max-w-2xl w-full p-6 space-y-4 border-2 border-black my-8">
            <div className="flex items-center justify-between border-b border-black pb-3">
              <h3 className="text-lg font-bold text-black uppercase tracking-tight">Create New Mock Exam</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-neutral-500 hover:text-black font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {excelError && (
              <div className="p-3 bg-neutral-100 border-2 border-black text-black text-xs font-bold">
                Error: {excelError}
              </div>
            )}

            {excelStatus && (
              <div className="p-2 bg-neutral-50 border border-neutral-400 text-neutral-700 text-xs">
                {excelStatus}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-bold uppercase text-black mb-1">Exam Title *</label>
                <input
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. NPTEL Python Midterm Mock Exam"
                  className="w-full px-3 py-2 border border-black rounded text-sm text-black focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>

              {/* Subject Selection / Creation */}
              <div className="col-span-2 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase text-black">Subject / Category *</label>
                  <button
                    type="button"
                    onClick={() => setIsCreatingNewSubject(!isCreatingNewSubject)}
                    className="text-xs font-semibold text-black underline hover:text-neutral-600"
                  >
                    {isCreatingNewSubject ? 'Select Existing Subject' : '+ Create New Subject'}
                  </button>
                </div>

                {isCreatingNewSubject || subjects.length === 0 ? (
                  <input
                    required
                    value={newSubjectName}
                    onChange={e => setNewSubjectName(e.target.value)}
                    placeholder="Enter new subject name (e.g. Programming in Python)"
                    className="w-full px-3 py-2 border border-black rounded text-sm text-black focus:outline-none focus:ring-1 focus:ring-black"
                  />
                ) : (
                  <select
                    value={subjectId}
                    onChange={e => setSubjectId(e.target.value)}
                    className="w-full px-3 py-2 border border-black rounded text-sm text-black bg-white focus:outline-none focus:ring-1 focus:ring-black"
                  >
                    {subjects.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Questions Excel Section with Download Option */}
              <div className="col-span-2 p-4 border-2 border-black rounded bg-neutral-50 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="block text-xs font-bold uppercase text-black">Questions Excel Spreadsheet (.xlsx)</label>
                    <p className="text-xs text-neutral-600">
                      Upload your question bank formatted spreadsheet directly with this exam.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="px-3 py-1.5 bg-white border border-black text-black font-bold text-xs rounded hover:bg-neutral-100 flex items-center space-x-1.5 self-start whitespace-nowrap shadow-none"
                  >
                    <span>📄</span>
                    <span>Download Formatted Excel</span>
                  </button>
                </div>

                <div>
                  <input
                    type="file"
                    accept=".xlsx"
                    onChange={handleFileChange}
                    className="w-full text-xs text-black file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-black file:text-xs file:font-bold file:bg-black file:text-white hover:file:bg-neutral-800 cursor-pointer"
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Columns required: topic, question, option_a, option_b, option_c, option_d, correct (A/B/C/D), marks.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-black mb-1">Duration (minutes) *</label>
                <input
                  type="number"
                  min={5}
                  required
                  value={durationMinutes}
                  onChange={e => setDurationMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-black rounded text-sm text-black"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-black mb-1">Questions per Student *</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={questionsPerStudent}
                  onChange={e => setQuestionsPerStudent(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-black rounded text-sm text-black"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-black mb-1">Batch Filter (Optional)</label>
                <input
                  value={batchFilter}
                  onChange={e => setBatchFilter(e.target.value)}
                  placeholder="e.g. 2026 (blank = all students)"
                  className="w-full px-3 py-2 border border-black rounded text-sm text-black"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-black mb-1">Assignment Score (out of 25) *</label>
                <input
                  type="number"
                  min={0}
                  max={25}
                  required
                  value={assignmentMarks}
                  onChange={e => setAssignmentMarks(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-black rounded text-sm text-black"
                />
              </div>

              {/* Join Policy Selector */}
              <div className="col-span-2 p-4 bg-white rounded border border-black space-y-3">
                <label className="block text-xs font-bold uppercase text-black">Join Policy</label>
                <div className="space-y-2">
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="radio"
                      name="joinPolicy"
                      value="FIXED_END"
                      checked={joinPolicy === 'FIXED_END'}
                      onChange={() => setJoinPolicy('FIXED_END')}
                      className="mt-1 accent-black"
                    />
                    <div>
                      <span className="font-bold text-sm text-black">FIXED_END (Synchronous Exam)</span>
                      <p className="text-xs text-neutral-600">
                        Everyone ends at the exact same hard stop time. Late-joining students have less duration.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="radio"
                      name="joinPolicy"
                      value="FULL_DURATION"
                      checked={joinPolicy === 'FULL_DURATION'}
                      onChange={() => setJoinPolicy('FULL_DURATION')}
                      className="mt-1 accent-black"
                    />
                    <div>
                      <span className="font-bold text-sm text-black">FULL_DURATION (Rolling Joins)</span>
                      <p className="text-xs text-neutral-600">
                        Every student gets their full duration from the moment they enter the exam.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-black mb-1">Late Join Cutoff (min)</label>
                <input
                  type="number"
                  min={0}
                  value={lateJoinCutoff}
                  onChange={e => setLateJoinCutoff(e.target.value ? Number(e.target.value) : '')}
                  placeholder="e.g. 15 (blank = no limit)"
                  className="w-full px-3 py-2 border border-black rounded text-sm text-black"
                />
              </div>

              {/* Safe Browser Enforcement */}
              <div className="col-span-2 p-3 bg-neutral-50 rounded border border-black">
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireSafeBrowser}
                    onChange={e => setRequireSafeBrowser(e.target.checked)}
                    className="accent-black w-4 h-4"
                  />
                  <div>
                    <span className="text-xs font-bold uppercase text-black">Enforce Safe Exam Browser Mode</span>
                    <p className="text-[11px] text-neutral-600">
                      Activates full-screen lockdown, window blur detection, clipboard/shortcut blocks, and audit logging.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4 border-t border-black">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm text-black border border-neutral-300 rounded hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-black hover:bg-neutral-800 disabled:bg-neutral-400 text-white rounded text-sm font-bold border border-black transition-colors"
              >
                {isSubmitting ? 'Creating...' : 'Create Exam & Setup Pool'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
