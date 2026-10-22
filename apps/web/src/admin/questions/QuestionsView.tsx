import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';

export default function QuestionsView() {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Fetch subjects
  const { data: subjects = [], refetch: refetchSubjects } = useQuery({
    queryKey: ['adminSubjects'],
    queryFn: async () => {
      const list = await api.get('/admin/subjects');
      if (list.length > 0 && !selectedSubjectId) {
        setSelectedSubjectId(list[0].id);
      }
      return list;
    }
  });

  // Fetch topics for subject
  const { data: topics = [] } = useQuery({
    queryKey: ['adminTopics', selectedSubjectId],
    queryFn: () => api.get(`/admin/questions/topics?subjectId=${selectedSubjectId}`),
    enabled: !!selectedSubjectId
  });

  // Fetch questions
  const { data: qData, refetch: refetchQuestions, isLoading } = useQuery({
    queryKey: ['adminQuestions', selectedSubjectId, selectedTopic, search],
    queryFn: () => {
      let url = `/admin/questions?subjectId=${selectedSubjectId}&limit=50`;
      if (selectedTopic) url += `&topic=${encodeURIComponent(selectedTopic)}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      return api.get(url);
    },
    enabled: !!selectedSubjectId
  });

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/subjects', { name: newSubjectName });
      setShowSubjectModal(false);
      setNewSubjectName('');
      setSelectedSubjectId(res.id);
      refetchSubjects();
    } catch (err: any) {
      alert(err.message || 'Failed to create subject');
    }
  };

  const handleDryRunUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !selectedSubjectId) return;

    setUploading(true);
    setUploadPreview(null);
    const fd = new FormData();
    fd.append('file', uploadFile);
    fd.append('subjectId', selectedSubjectId);

    try {
      const res = await api.post('/admin/questions/import', fd);
      setUploadPreview(res);
    } catch (err: any) {
      alert(err.message || 'Failed to parse Excel file');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!uploadPreview?.token) return;
    setConfirming(true);
    try {
      const res = await api.post('/admin/questions/import/confirm', { token: uploadPreview.token });
      setStatusMsg(`Successfully imported ${res.importedCount} questions into question bank`);
      setUploadPreview(null);
      setUploadFile(null);
      refetchQuestions();
    } catch (err: any) {
      alert(err.message || 'Failed to confirm import');
    } finally {
      setConfirming(false);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    try {
      await api.delete(`/admin/questions/${id}`);
      refetchQuestions();
    } catch (err: any) {
      alert(err.message || 'Failed to delete question');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Question Bank</h1>
          <p className="text-slate-500 text-sm">Upload Excel spreadsheets and organize question pools</p>
        </div>

        <div className="flex items-center space-x-3">
          <a
            href="/api/admin/questions/template.xlsx"
            download
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg text-sm hover:bg-slate-50 shadow-sm flex items-center space-x-2"
          >
            <span>📄</span>
            <span>Download Template</span>
          </a>
          <button
            onClick={() => setShowSubjectModal(true)}
            className="px-3.5 py-2 bg-slate-800 text-white font-medium rounded-lg text-sm hover:bg-slate-900 shadow-sm"
          >
            + New Subject
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="bg-emerald-50 text-emerald-700 p-3 rounded-lg border border-emerald-200 text-sm flex justify-between">
          <span>{statusMsg}</span>
          <button onClick={() => setStatusMsg(null)} className="font-bold">×</button>
        </div>
      )}

      {/* Upload & Subject Filter Box */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium bg-white"
            >
              {subjects.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Upload Questions (.xlsx)</label>
            <form onSubmit={handleDryRunUpload} className="flex items-center space-x-3">
              <input
                type="file"
                accept=".xlsx"
                required
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                className="flex-1 text-sm text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100"
              />
              <button
                type="submit"
                disabled={uploading || !uploadFile}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white font-bold text-sm rounded-lg shadow-sm"
              >
                {uploading ? 'Validating...' : 'Validate Excel'}
              </button>
            </form>
          </div>
        </div>

        {/* Upload Dry-Run Preview Modal/Box */}
        {uploadPreview && (
          <div className="mt-4 p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 text-base">File Validation Summary</h4>
                <p className="text-xs text-slate-500">Review results before committing to database.</p>
              </div>

              <div className="flex items-center space-x-3">
                <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  {uploadPreview.validCount} Valid Questions
                </span>
                {uploadPreview.errorsCount > 0 && (
                  <span className="text-sm font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-200">
                    {uploadPreview.errorsCount} Errors
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={confirming || uploadPreview.validCount === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-sm rounded-lg shadow"
                >
                  {confirming ? 'Importing...' : 'Confirm & Save All'}
                </button>
              </div>
            </div>

            {uploadPreview.errors?.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-bold text-red-800 mb-1">Errors detected in file:</p>
                <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                  {uploadPreview.errors.map((err: any, i: number) => (
                    <li key={i}>Row {err.row}: [{err.field}] {err.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* First 20 Preview Table */}
            {uploadPreview.preview?.length > 0 && (
              <div className="overflow-x-auto max-h-60 rounded border border-slate-200 bg-white">
                <table className="w-full text-xs text-left text-slate-700">
                  <thead className="bg-slate-100 text-slate-600 font-semibold border-b">
                    <tr>
                      <th className="p-2">Topic</th>
                      <th className="p-2">Question</th>
                      <th className="p-2">Options</th>
                      <th className="p-2">Correct</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {uploadPreview.preview.map((row: any, i: number) => (
                      <tr key={i}>
                        <td className="p-2 font-medium">{row.topic}</td>
                        <td className="p-2 max-w-xs truncate">{row.question}</td>
                        <td className="p-2">A: {row.option_a?.slice(0, 15)}...</td>
                        <td className="p-2 font-mono font-bold text-emerald-600 uppercase">{row.correct}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter and Question Bank Listing */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3 flex-1">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search questions by text..."
            className="w-full max-w-sm px-3.5 py-1.5 border border-slate-300 rounded-lg text-sm"
          />
          <select
            value={selectedTopic}
            onChange={e => setSelectedTopic(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="">All Topics ({topics.length})</option>
            {topics.map((t: any) => (
              <option key={t.topic} value={t.topic}>{t.topic} ({t.count})</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-slate-500 font-medium">Total: {qData?.total || 0} questions</span>
      </div>

      {/* Questions List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            Loading questions...
          </div>
        ) : qData?.questions?.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
            No questions found in this subject/topic.
          </div>
        ) : (
          qData?.questions?.map((q: any, i: number) => (
            <div key={q.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between gap-4">
              <div className="space-y-2 flex-1">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-100">
                    {q.topic} {q.subtopic ? `→ ${q.subtopic}` : ''}
                  </span>
                  <span className="text-xs font-mono text-slate-400">Q#{i + 1}</span>
                </div>
                <p className="text-sm text-slate-800 font-medium whitespace-pre-wrap">{q.bodyMd}</p>
                {q.codeSnippet && (
                  <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-32">
                    <code>{q.codeSnippet}</code>
                  </pre>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                  <div className={`p-2 rounded border ${q.correct === 'a' ? 'border-emerald-500 bg-emerald-50 font-bold' : 'border-slate-100 bg-slate-50'}`}>
                    A: {q.optionA}
                  </div>
                  <div className={`p-2 rounded border ${q.correct === 'b' ? 'border-emerald-500 bg-emerald-50 font-bold' : 'border-slate-100 bg-slate-50'}`}>
                    B: {q.optionB}
                  </div>
                  <div className={`p-2 rounded border ${q.correct === 'c' ? 'border-emerald-500 bg-emerald-50 font-bold' : 'border-slate-100 bg-slate-50'}`}>
                    C: {q.optionC}
                  </div>
                  <div className={`p-2 rounded border ${q.correct === 'd' ? 'border-emerald-500 bg-emerald-50 font-bold' : 'border-slate-100 bg-slate-50'}`}>
                    D: {q.optionD}
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleDeleteQuestion(q.id)}
                className="text-xs text-red-500 hover:text-red-700 font-semibold p-1"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>

      {/* Create Subject Modal */}
      {showSubjectModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateSubject} className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl border">
            <h3 className="text-lg font-bold text-slate-800">New Subject</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subject Name</label>
              <input
                required
                value={newSubjectName}
                onChange={e => setNewSubjectName(e.target.value)}
                placeholder="e.g. Operating Systems"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button type="button" onClick={() => setShowSubjectModal(false)} className="px-3 py-1.5 text-sm text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-1.5 bg-sky-600 text-white rounded-lg text-sm font-bold">Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
