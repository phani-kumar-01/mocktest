import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { StudentHomeResponse } from '@nptel/shared';

interface HomeProps {
  user: { name: string; rollNo?: string };
  onEnterExam: (attemptId: string) => void;
  onLogout: () => void;
}

export default function StudentHome({ user, onEnterExam, onLogout }: HomeProps) {
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Poll /student/home every 5 seconds
  const { data: homeState, isLoading } = useQuery<StudentHomeResponse>({
    queryKey: ['studentHome'],
    queryFn: () => api.get('/student/home'),
    refetchInterval: 5000
  });

  const handleStartExam = async (examId: string) => {
    setStarting(true);
    setStartError(null);
    try {
      const res = await api.post(`/student/exams/${examId}/start`);
      onEnterExam(res.attemptId);
    } catch (err: any) {
      setStartError(err.message || 'Failed to start exam');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-sky-600 flex items-center justify-center text-white font-bold text-sm">
            N
          </div>
          <span className="font-bold text-slate-800 text-lg">NPTEL Mock Portal</span>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-800">{user.name}</p>
            <p className="text-xs text-slate-500 font-mono">{user.rollNo}</p>
          </div>
          <button
            onClick={onLogout}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded border border-slate-300 font-medium transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center p-6">
        {isLoading ? (
          <div className="text-slate-500 animate-pulse text-sm">Checking exam server status...</div>
        ) : homeState?.state === 'live' && homeState.exam ? (
          <div className="bg-white max-w-lg w-full rounded-2xl shadow-md border border-slate-200 p-8 text-center space-y-6">
            <div className="inline-flex p-3 bg-emerald-50 rounded-full text-emerald-600">
              <span className="w-3 h-3 bg-emerald-500 rounded-full animate-ping mr-2 self-center"></span>
              <span className="text-xs font-bold uppercase tracking-wider">Exam is Live Now</span>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-slate-900">{homeState.exam.title}</h2>
              <p className="text-slate-500 text-sm mt-1">Duration: {homeState.exam.durationMinutes} minutes</p>
            </div>

            {startError && (
              <div className="bg-red-50 text-red-700 text-sm p-3 rounded border border-red-200">
                {startError}
              </div>
            )}

            {homeState.exam.canEnter ? (
              <button
                onClick={() => handleStartExam(homeState.exam!.id)}
                disabled={starting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold py-3.5 px-6 rounded-xl text-lg shadow-lg shadow-emerald-600/20 transition-all transform active:scale-[0.99]"
              >
                {starting ? 'Entering Exam...' : (homeState.attemptId ? 'Resume Exam' : 'Enter Exam')}
              </button>
            ) : (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm">
                <p className="font-semibold">Entry Closed</p>
                <p className="text-xs mt-1">{homeState.exam.reason || 'Late join cutoff has passed.'}</p>
              </div>
            )}
          </div>
        ) : homeState?.state === 'submitted' ? (
          <div className="bg-white max-w-md w-full rounded-2xl shadow-sm border border-slate-200 p-8 text-center space-y-4">
            <div className="w-12 h-12 bg-sky-100 text-sky-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              ✓
            </div>
            <h2 className="text-xl font-bold text-slate-800">Exam Submitted</h2>
            <p className="text-slate-600 text-sm">
              Your exam has been submitted successfully. Your score and topic report will be emailed once results are published.
            </p>
            <p className="text-xs text-slate-400">Please wait for the next exam schedule.</p>
          </div>
        ) : (
          <div className="bg-white max-w-md w-full rounded-2xl shadow-sm border border-slate-200 p-8 text-center space-y-4">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              ⏳
            </div>
            <h2 className="text-xl font-bold text-slate-800">No Exam Live Right Now</h2>
            <p className="text-slate-600 text-sm">
              When the administrator starts an exam, the enter button will appear automatically on this screen.
            </p>
            <div className="flex items-center justify-center space-x-2 text-xs text-slate-400">
              <span className="w-2 h-2 bg-sky-400 rounded-full animate-pulse"></span>
              <span>Polling server every 5 seconds...</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
