import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';

export default function DashboardView() {
  const navigate = useNavigate();

  const { data: exams = [] } = useQuery({
    queryKey: ['adminDashboardExams'],
    queryFn: () => api.get('/admin/exams')
  });

  const { data: students = [] } = useQuery({
    queryKey: ['adminDashboardStudents'],
    queryFn: () => api.get('/admin/students')
  });

  const liveExam = exams.find((e: any) => e.status === 'live');
  const recentExams = exams.slice(0, 5);

  return (
    <div className="space-y-8 bg-white text-black">
      {/* Welcome Banner */}
      <div className="border-b border-black pb-4">
        <h1 className="text-3xl font-extrabold text-black uppercase tracking-tight">System Dashboard</h1>
        <p className="text-neutral-600 text-sm mt-1">Overview of exams, active students, and live performance</p>
      </div>

      {/* Live Exam Alert Banner */}
      {liveExam ? (
        <div className="bg-black text-white border-2 border-black rounded p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 bg-white rounded-full"></span>
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">Live Examination Active</span>
            </div>
            <h2 className="text-2xl font-bold text-white">{liveExam.title}</h2>
            <p className="text-xs text-neutral-300">Duration: {liveExam.durationMinutes} mins | Policy: {liveExam.joinPolicy}</p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate(`/admin/monitor?examId=${liveExam.id}`)}
              className="px-5 py-2.5 bg-white hover:bg-neutral-200 text-black font-bold rounded text-sm transition-colors border border-white"
            >
              Open Live Monitor
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded border border-black p-6 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-black text-lg">No Live Exam Right Now</h3>
            <p className="text-xs text-neutral-600 mt-0.5">Start an exam from the Exams page to allow students to enter.</p>
          </div>
          <button
            onClick={() => navigate('/admin/exams')}
            className="px-4 py-2 bg-black text-white font-bold text-sm rounded hover:bg-neutral-800 transition-colors"
          >
            Go to Exams
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white rounded p-6 border border-black space-y-2">
          <span className="text-xs font-bold uppercase text-neutral-500 tracking-wider">Total Mock Exams</span>
          <p className="text-3xl font-extrabold text-black">{exams.length}</p>
          <span className="text-xs text-neutral-600">{exams.filter((e: any) => e.status === 'ended').length} completed</span>
        </div>

        <div className="bg-white rounded p-6 border border-black space-y-2">
          <span className="text-xs font-bold uppercase text-neutral-500 tracking-wider">Enrolled Students</span>
          <p className="text-3xl font-extrabold text-black">{students.length}</p>
          <span className="text-xs text-neutral-600">Active credentials ready</span>
        </div>

        <div className="bg-white rounded p-6 border border-black space-y-2">
          <span className="text-xs font-bold uppercase text-neutral-500 tracking-wider">Active System Status</span>
          <p className="text-3xl font-extrabold text-black">ONLINE</p>
          <span className="text-xs text-neutral-600">PostgreSQL & Fastify Core</span>
        </div>
      </div>

      {/* Recent Exams Table */}
      <div className="bg-white rounded border border-black p-6 space-y-4">
        <h3 className="font-bold text-black text-base uppercase tracking-tight">Recent Mock Exams</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-black">
            <thead className="bg-neutral-100 text-xs text-black font-bold border-b border-black">
              <tr>
                <th className="py-2.5 px-3">Title</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Duration</th>
                <th className="py-2.5 px-3">Join Policy</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y border-b border-black">
              {recentExams.map((e: any) => (
                <tr key={e.id} className="hover:bg-neutral-50">
                  <td className="py-3 px-3 font-semibold text-black">{e.title}</td>
                  <td className="py-3 px-3">
                    <span className="text-xs font-bold uppercase px-2 py-0.5 rounded border border-black bg-neutral-100 text-black">
                      {e.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-neutral-700">{e.durationMinutes}m</td>
                  <td className="py-3 px-3 font-mono text-xs">{e.joinPolicy}</td>
                  <td className="py-3 px-3 text-right space-x-3">
                    <button
                      onClick={() => navigate(`/admin/monitor?examId=${e.id}`)}
                      className="text-xs text-black underline hover:text-neutral-600 font-bold"
                    >
                      Monitor
                    </button>
                    <button
                      onClick={() => navigate(`/admin/results?examId=${e.id}`)}
                      className="text-xs text-black underline hover:text-neutral-600 font-bold"
                    >
                      Results
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
