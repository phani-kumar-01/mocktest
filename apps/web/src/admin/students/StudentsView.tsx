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
    <div className="space-y-6 bg-white text-black">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black pb-4">
        <div>
          <h1 className="text-2xl font-bold uppercase tracking-tight text-black">Student Directory</h1>
          <p className="text-neutral-600 text-sm">Manage enrolled students and credentials</p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => { setImportResult(null); setImportFile(null); setShowImportModal(true); }}
            className="px-4 py-2 bg-white border border-black text-black font-bold rounded text-sm hover:bg-neutral-100 transition-colors"
          >
            📥 Import CSV / XLSX
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-black text-white font-bold rounded text-sm hover:bg-neutral-800 border border-black transition-colors"
          >
            + Add Student
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="bg-neutral-100 text-black p-3 rounded border border-black text-sm flex justify-between font-bold">
          <span>{statusMsg}</span>
          <button onClick={() => setStatusMsg(null)}>✕</button>
        </div>
      )}

      {/* Search Bar */}
      <div className="bg-white p-4 rounded border border-black flex items-center justify-between">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by roll number or name..."
          className="w-full max-w-md px-3.5 py-2 border border-black rounded text-sm text-black focus:outline-none focus:ring-1 focus:ring-black"
        />
        <span className="text-xs text-neutral-600 font-bold uppercase">Total: {students.length} students</span>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded border border-black overflow-hidden">
        <table className="w-full text-left text-sm text-black">
          <thead className="bg-neutral-100 border-b border-black text-xs font-bold text-black uppercase">
            <tr>
              <th className="py-3 px-4">Roll Number</th>
              <th className="py-3 px-4">Student Name</th>
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-4">Batch</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y border-b border-black">
            {isLoading ? (
              <tr><td colSpan={5} className="py-8 text-center text-neutral-500">Loading directory...</td></tr>
            ) : students.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-neutral-500">No students found.</td></tr>
            ) : (
              students.map((s: any) => (
                <tr key={s.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-black">{s.rollNo}</td>
                  <td className="py-3 px-4 font-medium text-black">{s.name}</td>
                  <td className="py-3 px-4 text-neutral-600">{s.email || '—'}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 bg-neutral-100 border border-neutral-400 rounded text-xs text-black font-mono">
                      {s.batch}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => handleResetPassword(s.id, s.rollNo)}
                      className="text-xs text-black hover:text-neutral-600 font-bold underline"
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
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleCreate} className="bg-white rounded max-w-md w-full border-2 border-black p-6 space-y-4">
            <h3 className="text-lg font-bold text-black uppercase">Add New Student</h3>
            <div>
              <label className="block text-xs font-bold uppercase text-black mb-1">Roll Number</label>
              <input required value={rollNo} onChange={e => setRollNo(e.target.value)} placeholder="e.g. CS21045" className="w-full px-3 py-2 border border-black rounded text-sm text-black" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-black mb-1">Name</label>
              <input required value={name} onChange={e => setName(e.target.value)} placeholder="Full Name" className="w-full px-3 py-2 border border-black rounded text-sm text-black" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-black mb-1">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="student@college.edu" className="w-full px-3 py-2 border border-black rounded text-sm text-black" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-black mb-1">Batch / Section</label>
              <input value={batch} onChange={e => setBatch(e.target.value)} placeholder="2026" className="w-full px-3 py-2 border border-black rounded text-sm text-black" />
            </div>
            <div className="flex justify-end space-x-3 pt-3 border-t border-black">
              <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-black border border-neutral-300 rounded hover:bg-neutral-100">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-black text-white rounded text-sm font-bold border border-black hover:bg-neutral-800">Save Student</button>
            </div>
          </form>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded max-w-lg w-full border-2 border-black p-6 space-y-4">
            <h3 className="text-lg font-bold text-black uppercase">Import Students from CSV / XLSX</h3>
            <p className="text-xs text-neutral-600">
              Columns required: <code className="font-bold">roll_no, name, email, batch</code>. First row is header.
            </p>

            <form onSubmit={handleImport} className="space-y-4">
              <input
                type="file"
                accept=".csv, .xlsx"
                required
                onChange={e => setImportFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-black file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-black file:text-xs file:font-bold file:bg-neutral-100 file:text-black hover:file:bg-neutral-200 cursor-pointer"
              />

              <div className="flex justify-end space-x-3 pt-2 border-t border-black">
                <button type="button" onClick={() => setShowImportModal(false)} className="px-4 py-2 text-sm text-black border border-neutral-300 rounded hover:bg-neutral-100">Close</button>
                <button type="submit" className="px-4 py-2 bg-black text-white rounded text-sm font-bold border border-black hover:bg-neutral-800">Upload & Import</button>
              </div>
            </form>

            {importResult && (
              <div className="bg-neutral-50 p-4 rounded border border-black space-y-2 text-sm">
                <p className="font-bold text-black uppercase">Import Summary:</p>
                <p className="text-black font-semibold">Created: {importResult.created} students</p>
                <p className="text-black font-semibold">Updated: {importResult.updated} students</p>
                {importResult.errors?.length > 0 && (
                  <p className="text-black font-bold">Errors: {importResult.errors.length} rows</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
