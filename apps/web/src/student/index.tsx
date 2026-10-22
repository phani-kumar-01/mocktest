import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import StudentLogin from './Login.js';
import StudentHome from './Home.js';
import StudentExam from './Exam.js';
import { useStudentExamStore } from './store.js';
import { AuthMeResponse, StudentAttemptResponse } from '@nptel/shared';

export default function StudentApp() {
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);
  const [examTitle] = useState<string>('NPTEL Mock Examination');
  const { initExam, resetExam } = useStudentExamStore();

  // Check auth status
  const { data: auth, refetch: refetchAuth, isLoading: authLoading } = useQuery<AuthMeResponse>({
    queryKey: ['studentAuthMe'],
    queryFn: () => api.get('/auth/me'),
    retry: false
  });

  const isAuthenticated = auth?.role === 'student' && auth.user;

  const handleEnterExam = async (attemptId: string) => {
    try {
      const data: StudentAttemptResponse = await api.get(`/student/attempts/${attemptId}`);
      initExam({
        attemptId,
        status: data.status,
        questions: data.questions,
        answers: data.answers,
        deadlineAt: data.deadlineAt,
        serverTime: data.serverTime
      });
      setActiveAttemptId(attemptId);
    } catch (err: any) {
      console.error('Failed to load attempt questions:', err);
    }
  };

  const handleExamFinished = () => {
    setActiveAttemptId(null);
    resetExam();
  };

  const handleLogout = async () => {
    await api.post('/auth/logout');
    refetchAuth();
    setActiveAttemptId(null);
    resetExam();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-slate-500 text-sm animate-pulse">Loading Student Portal...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <StudentLogin onSuccess={() => refetchAuth()} />;
  }

  if (activeAttemptId) {
    return <StudentExam examTitle={examTitle} onFinished={handleExamFinished} />;
  }

  return (
    <StudentHome
      user={auth.user}
      onEnterExam={(attId) => handleEnterExam(attId)}
      onLogout={handleLogout}
    />
  );
}
