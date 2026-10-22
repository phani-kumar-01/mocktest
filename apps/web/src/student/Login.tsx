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
    <div className="min-h-screen bg-neutral-100 flex flex-col justify-center items-center px-4 text-black">
      <div className="max-w-md w-full bg-white rounded border-2 border-black overflow-hidden shadow-none">
        <div className="bg-black py-6 px-8 text-center text-white">
          <h1 className="text-2xl font-bold tracking-tight uppercase">NPTEL Mock Exam Portal</h1>
          <p className="text-neutral-400 text-sm mt-1">Student Examination Login</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {error && (
            <div className="bg-neutral-100 border-2 border-black text-black px-4 py-3 rounded text-sm font-bold">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-bold uppercase tracking-wider text-black mb-1">Roll Number</label>
            <input
              type="text"
              required
              value={rollNo}
              onChange={(e) => setRollNo(e.target.value)}
              placeholder="e.g. CS21001"
              className="w-full px-3 py-2 border border-black rounded focus:outline-none focus:ring-1 focus:ring-black font-mono text-black"
            />
          </div>

          <div>
            <label className="block text-sm font-bold uppercase tracking-wider text-black mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Default is your roll number"
              className="w-full px-3 py-2 border border-black rounded focus:outline-none focus:ring-1 focus:ring-black text-black"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black hover:bg-neutral-800 disabled:bg-neutral-400 text-white font-bold py-2.5 rounded transition-colors border border-black uppercase tracking-wider"
          >
            {loading ? 'Authenticating...' : 'Sign In to Portal'}
          </button>

          <p className="text-xs text-center text-neutral-500">
            Default password is your Roll Number unless changed.
          </p>
        </form>
      </div>
    </div>
  );
}
