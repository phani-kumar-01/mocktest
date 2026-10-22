import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';

export default function ExamsView() {
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState<string | null>(null);
  const [extendMinutes, setExtendMinutes] = useState(10);

  // Form fields
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [questionsPerStudent, setQuestionsPerStudent] = useState(50);
  const [joinPolicy, setJoinPolicy] = useState<'FIXED_END' | 'FULL_DURATION'>('FIXED_END');
  const [lateJoinCutoff, setLateJoinCutoff] = useState<number | ''>('');
  const [assignmentMarks, setAssignmentMarks] = useState(20);
  const [batchFilter, setBatchFilter] = useState('');

  // Fetch exams
  const { data: exams = [], refetch: refetchExams, isLoading } = useQuery({
    queryKey: ['adminExams'],
    queryFn: () => api.get('/admin/exams')
  });

  // Fetch subjects
  const { data: subjects = [] } = useQuery({
    queryKey: ['adminSubjects'],
    queryFn: async () => {
      const list = await api.get('/admin/subjects');
      if (list.length > 0 && !subjectId) setSubjectId(list[0].id);
      return list;
    }
  });

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.post('/admin/exams', {
        title,
        subjectId,
        durationMinutes,
        questionsPerStudent,
        joinPolicy,
        lateJoinCutoffMinutes: lateJoinCutoff !== '' ? Number(lateJoinCutoff) : null,
        assignmentMarks,
        batchFilter: batchFilter || null
      });

      // Automatically assign all questions from this subject to pool
      await api.put(`/admin/exams/${created.id}/questions`, { subjectId });

      setShowCreateModal(false);
      refetchExams();
    } catch (err: any) {
      alert(err.message || 'Failed to create exam');
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Exam Management & Control</h1>
          <p className="text-slate-500 text-sm">Configure schedules, join policies, and live controls</p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg text-sm shadow-sm"
        >
          + Create New Exam
        </button>
      </div>

      {/* Exam List Cards */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white p-8 text-center text-slate-400 rounded-xl border">Loading exams...</div>
        ) : exams.length === 0 ? (
          <div className="bg-white p-8 text-center text-slate-400 rounded-xl border">No exams created yet.</div>
        ) : (
          exams.map((exam: any) => {
            const isLive = exam.status === 'live';
            const isDraft = exam.status === 'draft';
            const isEnded = exam.status === 'ended';

            let badgeClass = 'bg-slate-100 text-slate-700';
            if (isLive) badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300 animate-pulse';
            if (isEnded) badgeClass = 'bg-purple-100 text-purple-800';

            return (
              <div key={exam.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="text-lg font-bold text-slate-900">{exam.title}</h3>
                      <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${badgeClass}`}>
                        {exam.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Duration: {exam.durationMinutes}m {exam.extraMinutes > 0 ? `(+${exam.extraMinutes}m extra)` : ''} | Policy: <span className="font-semibold text-slate-700">{exam.joinPolicy}</span> | Questions: {exam.questionsPerStudent}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2">
                    {isDraft && (
                      <button
                        onClick={() => handleStartExam(exam.id)}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm"
                      >
                        Start Now ▶
                      </button>
                    )}

                    {isLive && (
                      <>
                        <button
                          onClick={() => setShowExtendModal(exam.id)}
                          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg"
                        >
                          + Extend Time
                        </button>
                        <button
                          onClick={() => handleStopExam(exam.id)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg"
                        >
                          Stop Exam ⏹
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => navigate(`/admin/monitor?examId=${exam.id}`)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg border border-slate-300"
                    >
                      📡 Live Monitor
                    </button>

                    <button
                      onClick={() => navigate(`/admin/results?examId=${exam.id}`)}
                      className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 font-semibold text-xs rounded-lg border border-sky-200"
                    >
                      🏆 Results
                    </button>
                  </div>
                </div>

                {/* Details Footer */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs text-slate-600">
                  <div>Assignment Marks: <span className="font-semibold text-slate-800">{exam.assignmentMarks} / 25</span></div>
                  <div>Batch Filter: <span className="font-semibold text-slate-800">{exam.batchFilter || 'All Students'}</span></div>
                  <div>Pass Threshold: <span className="font-semibold text-slate-800">{exam.passTotal} Marks</span></div>
                  <div>Results: <span className="font-semibold text-slate-800">{exam.resultsPublished ? 'Published ✓' : 'Unpublished'}</span></div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Extend Modal */}
      {showExtendModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl border">
            <h3 className="text-lg font-bold text-slate-800">Extend Active Exam Time</h3>
            <p className="text-xs text-slate-500">
              Minutes will be added to the duration and all active in-progress students' deadlines will immediately be extended.
            </p>
            <div className="flex space-x-2">
              {[5, 10, 15, 30].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setExtendMinutes(m)}
                  className={`flex-1 py-2 text-sm font-bold rounded-lg border ${extendMinutes === m ? 'bg-sky-600 text-white border-sky-600' : 'bg-slate-50 text-slate-700'}`}
                >
                  +{m}m
                </button>
              ))}
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button onClick={() => setShowExtendModal(null)} className="px-3 py-1.5 text-sm text-slate-600">Cancel</button>
              <button onClick={() => handleExtendExam(showExtendModal)} className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-sm">
                Extend Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Exam Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handleCreateExam} className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl border my-8">
            <h3 className="text-lg font-bold text-slate-800">Create New Mock Exam</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Exam Title</label>
                <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. NPTEL Python Midterm Mock Exam" className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
                <select value={subjectId} onChange={e => setSubjectId(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                  {subjects.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Duration (minutes)</label>
                <input type="number" min={5} required value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value))} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Questions per Student</label>
                <input type="number" min={1} required value={questionsPerStudent} onChange={e => setQuestionsPerStudent(Number(e.target.value))} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Batch Filter (Optional)</label>
                <input value={batchFilter} onChange={e => setBatchFilter(e.target.value)} placeholder="e.g. 2026 (blank = all)" className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>

              {/* Join Policy Radio Selector with Clear Explanations */}
              <div className="col-span-2 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <label className="block text-xs font-bold uppercase text-slate-700">Join Policy</label>
                <div className="space-y-2">
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="radio"
                      name="joinPolicy"
                      value="FIXED_END"
                      checked={joinPolicy === 'FIXED_END'}
                      onChange={() => setJoinPolicy('FIXED_END')}
                      className="mt-1"
                    />
                    <div>
                      <span className="font-bold text-sm text-slate-800">FIXED_END (Synchronous Exam)</span>
                      <p className="text-xs text-slate-500">
                        Everyone ends at the exact same time. A late-joining student gets less duration.
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
                      className="mt-1"
                    />
                    <div>
                      <span className="font-bold text-sm text-slate-800">FULL_DURATION (Rolling Joins)</span>
                      <p className="text-xs text-slate-500">
                        Every student gets their full duration from the moment they enter the exam.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Late Join Cutoff (min)</label>
                <input type="number" min={0} value={lateJoinCutoff} onChange={e => setLateJoinCutoff(e.target.value ? Number(e.target.value) : '')} placeholder="e.g. 15 (blank = no limit)" className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Assignment Score (out of 25)</label>
                <input type="number" min={0} max={25} required value={assignmentMarks} onChange={e => setAssignmentMarks(Number(e.target.value))} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4 border-t">
              <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button type="submit" className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-bold shadow-sm">
                Create & Setup Pool
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
