import { useState } from 'react';
import { api, ApiError } from '../../lib/api.js';

interface LoginProps {
  onSuccess: () => void;
}

export default function AdminLogin({ onSuccess }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.post('/auth/admin/login', { username, password });
      onSuccess();
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message || 'Login failed');
      } else {
        setError('Network error connecting to API');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col justify-center items-center px-4 text-black">
      <div className="max-w-md w-full bg-white rounded border-2 border-black overflow-hidden shadow-none">
        <div className="bg-black py-6 px-8 text-center text-white">
          <h1 className="text-xl font-bold tracking-tight uppercase">Admin Console</h1>
          <p className="text-neutral-400 text-xs mt-1">NPTEL Mock Examination System</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          {error && (
            <div className="bg-neutral-100 border-2 border-black text-black px-4 py-3 rounded text-sm font-bold">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-black mb-1">
              Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin"
              className="w-full px-3.5 py-2.5 bg-white border border-black rounded focus:outline-none focus:ring-1 focus:ring-black text-black font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-black mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 bg-white border border-black rounded focus:outline-none focus:ring-1 focus:ring-black text-black text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black hover:bg-neutral-800 disabled:bg-neutral-500 text-white font-bold py-2.5 rounded transition-colors text-sm border border-black uppercase tracking-wider"
          >
            {loading ? 'Authenticating...' : 'Sign In as Administrator'}
          </button>
        </form>
      </div>
    </div>
  );
}
