import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api.js';

export default function StudentsView() {
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [rollNo, setRollNo] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [batch, setBatch] = useState('2026');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const { data: students = [], refetch, isLoading } = useQuery({
    queryKey: ['adminStudents', search],
    queryFn: () => api.get(`/admin/students${search ? `?search=${encodeURIComponent(search)}` : ''}`)
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/students', { rollNo, name, email, batch });
      setShowCreateModal(false);
      setRollNo('');
      setName('');
      setEmail('');
      setStatusMsg(`Student ${rollNo} created successfully`);
      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to create student');
    }
  };

  const handleResetPassword = async (id: string, roll: string) => {
    if (!confirm(`Reset password for ${roll} to their roll number?`)) return;
    try {
      await api.post(`/admin/students/${id}/reset-password`);
      setStatusMsg(`Password for ${roll} reset to default`);
    } catch (err: any) {
      alert(err.message || 'Failed to reset password');
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;

    const fd = new FormData();
    fd.append('file', importFile);

    try {
      const res = await api.post('/admin/students/import', fd);
      setImportResult(res);
      refetch();
    } catch (err: any) {
      alert(err.message || 'Import failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Student Directory</h1>
          <p className="text-slate-500 text-sm">Manage enrolled students and credentials</p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => { setImportResult(null); setImportFile(null); setShowImportModal(true); }}
            className="px-4 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg text-sm hover:bg-slate-50 shadow-sm"
          >
            📥 Import CSV / XLSX
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-sky-600 text-white font-bold rounded-lg text-sm hover:bg-sky-700 shadow-sm"
          >
            + Add Student
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="bg-emerald-50 text-emerald-700 p-3 rounded-lg border border-emerald-200 text-sm flex justify-between">
          <span>{statusMsg}</span>
          <button onClick={() => setStatusMsg(null)} className="font-bold">×</button>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by roll number or name..."
          className="w-full max-w-md px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        <span className="text-xs text-slate-500 font-medium">Total: {students.length} students</span>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left text-sm text-slate-700">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase">
            <tr>
              <th className="py-3 px-4">Roll Number</th>
              <th className="py-3 px-4">Student Name</th>
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-4">Batch</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={5} className="py-8 text-center text-slate-400">Loading directory...</td></tr>
            ) : students.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-slate-400">No students found.</td></tr>
            ) : (
              students.map((s: any) => (
                <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-mono font-semibold text-slate-900">{s.rollNo}</td>
                  <td className="py-3 px-4 font-medium text-slate-800">{s.name}</td>
                  <td className="py-3 px-4 text-slate-500">{s.email || '—'}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600 font-mono">
                      {s.batch}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleResetPassword(s.id, s.rollNo)}
                      className="text-xs text-sky-600 hover:text-sky-800 font-medium underline"
                    >
                      Reset Password
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Add New Student</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Roll Number</label>
              <input required value={rollNo} onChange={e => setRollNo(e.target.value)} placeholder="e.g. CS21045" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
              <input required value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="student@college.edu" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Batch / Section</label>
              <input value={batch} onChange={e => setBatch(e.target.value)} placeholder="2026" className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div className="flex justify-end space-x-3 pt-3 border-t">
              <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold">Save Student</button>
            </div>
          </form>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Import Students from CSV / XLSX</h3>
            <p className="text-xs text-slate-500">
              Columns required: <code>roll_no, name, email, batch</code>. First row is header.
            </p>

            <form onSubmit={handleImport} className="space-y-4">
              <input
                type="file"
                accept=".csv, .xlsx"
                required
                onChange={e => setImportFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100"
              />

              <div className="flex justify-end space-x-3 pt-2">
                <button type="button" onClick={() => setShowImportModal(false)} className="px-4 py-2 text-sm text-slate-600">Close</button>
                <button type="submit" className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold">Upload & Import</button>
              </div>
            </form>

            {importResult && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2 text-sm">
                <p className="font-bold text-slate-800">Import Summary:</p>
                <p className="text-emerald-700">✓ Created: {importResult.created} students</p>
                <p className="text-sky-700">↻ Updated: {importResult.updated} students</p>
                {importResult.errors?.length > 0 && (
                  <p className="text-red-600">⚠ Errors: {importResult.errors.length} rows</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
