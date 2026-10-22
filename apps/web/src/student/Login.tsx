import { useState } from 'react';
import { api, ApiError } from '../lib/api.js';

interface LoginProps {
  onSuccess: () => void;
}

export default function StudentLogin({ onSuccess }: LoginProps) {
  const [rollNo, setRollNo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.post('/auth/student/login', { rollNo, password });
      onSuccess();
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message || 'Login failed');
      } else {
        setError('Network error. Check connection to server.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center px-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="bg-sky-700 py-6 px-8 text-center text-white">
          <h1 className="text-2xl font-bold tracking-tight">NPTEL Mock Exam Portal</h1>
          <p className="text-sky-100 text-sm mt-1">Student Examination Login</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Roll Number</label>
            <input
              type="text"
              required
              value={rollNo}
              onChange={(e) => setRollNo(e.target.value)}
              placeholder="e.g. CS21001"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono text-slate-800"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Default is your roll number"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-800"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 text-white font-medium py-2.5 rounded-lg transition-colors shadow-sm"
          >
            {loading ? 'Authenticating...' : 'Sign In to Portal'}
          </button>

          <p className="text-xs text-center text-slate-500">
            Default password is your Roll Number unless changed.
          </p>
        </form>
      </div>
    </div>
  );
}
