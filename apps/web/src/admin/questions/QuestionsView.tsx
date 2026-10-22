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
    <div className="space-y-6 bg-white text-black">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-black">Question Bank</h1>
          <p className="text-neutral-600 text-sm">Upload Excel spreadsheets and organize question pools</p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="px-4 py-2 bg-white border border-black text-black font-bold rounded text-sm hover:bg-neutral-100 flex items-center space-x-2 transition-colors"
          >
            <span>📄</span>
            <span>Download Template</span>
          </button>
          <button
            onClick={() => setShowSubjectModal(true)}
            className="px-4 py-2 bg-black text-white font-bold rounded text-sm hover:bg-neutral-800 border border-black transition-colors"
          >
            + New Subject
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="bg-neutral-100 text-black p-3 rounded border border-black text-sm flex justify-between font-bold">
          <span>{statusMsg}</span>
          <button onClick={() => setStatusMsg(null)}>✕</button>
        </div>
      )}

      {/* Upload & Subject Filter Box */}
      <div className="bg-white p-6 rounded border border-black space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase text-black mb-1">Subject</label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full px-3 py-2 border border-black rounded text-sm font-semibold bg-white text-black"
            >
              {subjects.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold uppercase text-black mb-1">Upload Questions (.xlsx)</label>
            <form onSubmit={handleDryRunUpload} className="flex items-center space-x-3">
              <input
                type="file"
                accept=".xlsx"
                required
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                className="flex-1 text-xs text-black file:mr-4 file:py-1.5 file:px-3 file:rounded file:border file:border-black file:text-xs file:font-bold file:bg-neutral-100 file:text-black hover:file:bg-neutral-200 cursor-pointer"
              />
              <button
                type="submit"
                disabled={uploading || !uploadFile}
                className="px-4 py-2 bg-black hover:bg-neutral-800 disabled:bg-neutral-300 text-white font-bold text-sm rounded border border-black transition-colors"
              >
                {uploading ? 'Validating...' : 'Validate Excel'}
              </button>
            </form>
          </div>
        </div>

        {/* Upload Dry-Run Preview Modal/Box */}
        {uploadPreview && (
          <div className="mt-4 p-5 bg-neutral-50 rounded border-2 border-black space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-black text-base uppercase">File Validation Summary</h4>
                <p className="text-xs text-neutral-600">Review results before committing to database.</p>
              </div>

              <div className="flex items-center space-x-3">
                <span className="text-sm font-bold text-black bg-white px-3 py-1 rounded border border-black">
                  {uploadPreview.validCount} Valid Questions
                </span>
                {uploadPreview.errorsCount > 0 && (
                  <span className="text-sm font-bold text-black bg-neutral-200 px-3 py-1 rounded border border-black">
                    {uploadPreview.errorsCount} Errors
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={confirming || uploadPreview.validCount === 0}
                  className="px-5 py-2 bg-black hover:bg-neutral-800 disabled:bg-neutral-300 text-white font-bold text-sm rounded border border-black transition-colors"
                >
                  {confirming ? 'Importing...' : 'Confirm & Save All'}
                </button>
              </div>
            </div>

            {uploadPreview.errors?.length > 0 && (
              <div className="bg-white border border-black rounded p-3 max-h-40 overflow-y-auto">
                <p className="text-xs font-bold text-black mb-1 uppercase">Errors detected in file:</p>
                <ul className="text-xs text-black space-y-1 list-disc list-inside">
                  {uploadPreview.errors.map((err: any, i: number) => (
                    <li key={i}>Row {err.row}: [{err.field}] {err.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* First 20 Preview Table */}
            {uploadPreview.preview?.length > 0 && (
              <div className="overflow-x-auto max-h-60 rounded border border-black bg-white">
                <table className="w-full text-xs text-left text-black">
                  <thead className="bg-neutral-100 text-black font-bold border-b border-black">
                    <tr>
                      <th className="p-2">Topic</th>
                      <th className="p-2">Question</th>
                      <th className="p-2">Options</th>
                      <th className="p-2">Correct</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y border-b border-black">
                    {uploadPreview.preview.map((row: any, i: number) => (
                      <tr key={i}>
                        <td className="p-2 font-bold">{row.topic}</td>
                        <td className="p-2 max-w-xs truncate">{row.question}</td>
                        <td className="p-2">A: {row.option_a?.slice(0, 15)}...</td>
                        <td className="p-2 font-mono font-bold uppercase">{row.correct}</td>
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
      <div className="bg-white p-4 rounded border border-black flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3 flex-1">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search questions by text..."
            className="w-full max-w-sm px-3.5 py-1.5 border border-black rounded text-sm text-black"
          />
          <select
            value={selectedTopic}
            onChange={e => setSelectedTopic(e.target.value)}
            className="px-3 py-1.5 border border-black rounded text-sm bg-white text-black"
          >
            <option value="">All Topics ({topics.length})</option>
            {topics.map((t: any) => (
              <option key={t.topic} value={t.topic}>{t.topic} ({t.count})</option>
            ))}
          </select>
        </div>
        <span className="text-xs text-neutral-600 font-bold uppercase">Total: {qData?.total || 0} questions</span>
      </div>

      {/* Questions List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="p-8 text-center text-neutral-500 bg-white rounded border border-black">
            Loading questions...
          </div>
        ) : qData?.questions?.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 bg-white rounded border border-black">
            No questions found in this subject/topic.
          </div>
        ) : (
          qData?.questions?.map((q: any, i: number) => (
            <div key={q.id} className="bg-white p-5 rounded border border-black flex items-start justify-between gap-4">
              <div className="space-y-2 flex-1">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-black bg-neutral-100 px-2.5 py-0.5 rounded border border-black uppercase">
                    {q.topic} {q.subtopic ? `→ ${q.subtopic}` : ''}
                  </span>
                  <span className="text-xs font-mono text-neutral-500">Q#{i + 1}</span>
                </div>
                <p className="text-sm text-black font-medium whitespace-pre-wrap">{q.bodyMd}</p>
                {q.codeSnippet && (
                  <pre className="bg-black text-white p-3 rounded text-xs font-mono overflow-x-auto max-h-32 border border-black">
                    <code>{q.codeSnippet}</code>
                  </pre>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                  <div className={`p-2 rounded border ${q.correct === 'a' ? 'border-2 border-black bg-black text-white font-bold' : 'border-neutral-300 bg-neutral-50 text-black'}`}>
                    A: {q.optionA}
                  </div>
                  <div className={`p-2 rounded border ${q.correct === 'b' ? 'border-2 border-black bg-black text-white font-bold' : 'border-neutral-300 bg-neutral-50 text-black'}`}>
                    B: {q.optionB}
                  </div>
                  <div className={`p-2 rounded border ${q.correct === 'c' ? 'border-2 border-black bg-black text-white font-bold' : 'border-neutral-300 bg-neutral-50 text-black'}`}>
                    C: {q.optionC}
                  </div>
                  <div className={`p-2 rounded border ${q.correct === 'd' ? 'border-2 border-black bg-black text-white font-bold' : 'border-neutral-300 bg-neutral-50 text-black'}`}>
                    D: {q.optionD}
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleDeleteQuestion(q.id)}
                className="text-xs text-black hover:text-neutral-600 font-bold underline p-1"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>

      {/* Create Subject Modal */}
      {showSubjectModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreateSubject} className="bg-white rounded max-w-sm w-full p-6 space-y-4 border-2 border-black">
            <h3 className="text-lg font-bold text-black uppercase">New Subject</h3>
            <div>
              <label className="block text-xs font-bold uppercase text-black mb-1">Subject Name</label>
              <input
                required
                value={newSubjectName}
                onChange={e => setNewSubjectName(e.target.value)}
                placeholder="e.g. Operating Systems"
                className="w-full px-3 py-2 border border-black rounded text-sm text-black"
              />
            </div>
            <div className="flex justify-end space-x-2 pt-2 border-t border-black">
              <button type="button" onClick={() => setShowSubjectModal(false)} className="px-3 py-1.5 text-sm text-black border border-neutral-300 rounded hover:bg-neutral-100">Cancel</button>
              <button type="submit" className="px-4 py-1.5 bg-black text-white rounded text-sm font-bold border border-black hover:bg-neutral-800">Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
