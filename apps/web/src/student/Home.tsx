import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { StudentHomeResponse } from '@nptel/shared';

interface HomeProps {
  user: { name: string; rollNo?: string };
  onEnterExam: (attemptId: string, title?: string) => void;
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

  // Check Safe Exam Browser
  const { data: browserCheck } = useQuery({
    queryKey: ['browserCheck'],
    queryFn: () => api.get('/student/browser-check'),
    staleTime: 60000
  });

  const handleStartExam = async (examId: string, title?: string) => {
    setStarting(true);
    setStartError(null);
    try {
      const res = await api.post(`/student/exams/${examId}/start`);
      onEnterExam(res.attemptId, title);
    } catch (err: any) {
      setStartError(err.message || 'Failed to start exam');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col text-black">
      {/* Top Navbar */}
      <header className="bg-black text-white border-b border-black px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded bg-white text-black flex items-center justify-center font-black text-sm border border-white">
            N
          </div>
          <span className="font-bold text-white text-lg uppercase tracking-tight">NPTEL Mock Portal</span>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-right">
            <p className="text-sm font-bold text-white">{user.name}</p>
            <p className="text-xs text-neutral-400 font-mono">{user.rollNo}</p>
          </div>
          <button
            onClick={onLogout}
            className="text-xs bg-neutral-900 hover:bg-neutral-800 text-white px-3 py-1.5 rounded border border-neutral-700 font-bold uppercase transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center p-6">
        {isLoading ? (
          <div className="text-neutral-500 font-bold text-sm">Checking exam server status...</div>
        ) : homeState?.state === 'live' && homeState.exam ? (
          <div className="bg-white max-w-lg w-full rounded border-2 border-black p-8 text-center space-y-6">
            <div className="inline-flex p-2.5 bg-neutral-100 rounded border border-black text-black">
              <span className="text-xs font-black uppercase tracking-wider">● Exam is Live Now</span>
            </div>

            <div>
              <h2 className="text-2xl font-black text-black uppercase tracking-tight">{homeState.exam.title}</h2>
              <p className="text-neutral-600 text-sm mt-1 font-semibold">Duration: {homeState.exam.durationMinutes} minutes</p>
            </div>

            {startError && (
              <div className="bg-neutral-100 text-black text-sm p-3 rounded border-2 border-black font-bold">
                {startError}
              </div>
            )}

            {/* Safe Browser Status & Notice */}
            <div className="bg-neutral-50 rounded border border-black p-3.5 text-left space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-black flex items-center">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 mr-1.5"></span>
                  Safe Exam Browser Lockdown
                </span>
                {browserCheck?.isSeb ? (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-600">
                    SEB Client Verified
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-neutral-800 bg-neutral-200 px-2 py-0.5 rounded border border-neutral-400">
                    In-Browser Safe Mode
                  </span>
                )}
              </div>
              <p className="text-[11px] text-neutral-600 leading-normal">
                This exam enforces full-screen lockdown, window focus tracking, anti-copy protection, and tab-switch audit logs. Exiting full-screen or switching windows will trigger a proctor warning.
              </p>
              <div className="pt-1 flex items-center justify-between text-[11px]">
                <a
                  href={`/api/student/exams/${homeState.exam.id}/seb-config`}
                  download
                  className="font-bold underline text-neutral-800 hover:text-black"
                >
                  Download .seb Configuration File
                </a>
              </div>
            </div>

            {homeState.exam.canEnter ? (
              <button
                onClick={() => handleStartExam(homeState.exam!.id, homeState.exam!.title)}
                disabled={starting}
                className="w-full bg-black hover:bg-neutral-800 disabled:bg-neutral-400 text-white font-bold py-3.5 px-6 rounded text-lg border border-black uppercase tracking-wider transition-all"
              >
                {starting ? 'Entering Exam...' : (homeState.attemptId ? 'Resume Exam' : 'Enter Exam')}
              </button>
            ) : (
              <div className="bg-neutral-100 border border-black text-black p-4 rounded text-sm">
                <p className="font-bold uppercase">Entry Closed</p>
                <p className="text-xs mt-1">{homeState.exam.reason || 'Late join cutoff has passed.'}</p>
              </div>
            )}
          </div>
        ) : homeState?.state === 'submitted' ? (
          <div className="bg-white max-w-md w-full rounded border-2 border-black p-8 text-center space-y-4">
            <div className="w-12 h-12 bg-neutral-100 text-black border border-black rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              ✓
            </div>
            <h2 className="text-xl font-bold text-black uppercase">Exam Submitted</h2>
            <p className="text-neutral-600 text-sm">
              Your exam has been submitted successfully. Your score and topic report will be emailed once results are published.
            </p>
            <p className="text-xs text-neutral-400 font-semibold">Please wait for the next exam schedule.</p>
          </div>
        ) : (
          <div className="bg-white max-w-md w-full rounded border-2 border-black p-8 text-center space-y-4">
            <div className="w-12 h-12 bg-neutral-100 text-black border border-black rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              ⏳
            </div>
            <h2 className="text-xl font-bold text-black uppercase">No Exam Live Right Now</h2>
            <p className="text-neutral-600 text-sm">
              When the administrator starts an exam, the enter button will appear automatically on this screen.
            </p>
            <div className="flex items-center justify-center space-x-2 text-xs text-neutral-500 font-semibold">
              <span className="w-2 h-2 bg-black rounded-full"></span>
              <span>Polling server every 5 seconds...</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
