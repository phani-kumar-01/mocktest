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
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">System Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Overview of exams, active students, and live performance</p>
      </div>

      {/* Live Exam Alert Banner */}
      {liveExam ? (
        <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 bg-emerald-500 rounded-full animate-ping"></span>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">Live Examination Active</span>
            </div>
            <h2 className="text-2xl font-bold text-emerald-950">{liveExam.title}</h2>
            <p className="text-xs text-emerald-700">Duration: {liveExam.durationMinutes} mins | Policy: {liveExam.joinPolicy}</p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => navigate(`/admin/monitor?examId=${liveExam.id}`)}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md transition-all"
            >
              Open Live Monitor 📡
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center justify-between shadow-sm">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">No Live Exam Right Now</h3>
            <p className="text-xs text-slate-500 mt-0.5">Start an exam from the Exams page to allow students to enter.</p>
          </div>
          <button
            onClick={() => navigate('/admin/exams')}
            className="px-4 py-2 bg-sky-600 text-white font-semibold text-sm rounded-lg hover:bg-sky-700 shadow-sm"
          >
            Go to Exams
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-2">
          <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Total Mock Exams</span>
          <p className="text-3xl font-extrabold text-slate-900">{exams.length}</p>
          <span className="text-xs text-slate-500">{exams.filter((e: any) => e.status === 'ended').length} completed</span>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-2">
          <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Enrolled Students</span>
          <p className="text-3xl font-extrabold text-slate-900">{students.length}</p>
          <span className="text-xs text-slate-500">Active credentials ready</span>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-2">
          <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Active System Status</span>
          <p className="text-3xl font-extrabold text-emerald-600">Healthy</p>
          <span className="text-xs text-slate-500">PostgreSQL 16 & Fastify</span>
        </div>
      </div>

      {/* Recent Exams Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h3 className="font-bold text-slate-900 text-base">Recent Mock Exams</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-50 text-xs text-slate-500 font-semibold border-b">
              <tr>
                <th className="py-2.5 px-3">Title</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Duration</th>
                <th className="py-2.5 px-3">Join Policy</th>
                <th className="py-2.5 px-3 text-right">Quick Links</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentExams.map((e: any) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="py-3 px-3 font-semibold text-slate-900">{e.title}</td>
                  <td className="py-3 px-3">
                    <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {e.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-600">{e.durationMinutes}m</td>
                  <td className="py-3 px-3 font-mono text-xs">{e.joinPolicy}</td>
                  <td className="py-3 px-3 text-right space-x-2">
                    <button
                      onClick={() => navigate(`/admin/monitor?examId=${e.id}`)}
                      className="text-xs text-sky-600 hover:text-sky-800 font-semibold"
                    >
                      Monitor
                    </button>
                    <button
                      onClick={() => navigate(`/admin/results?examId=${e.id}`)}
                      className="text-xs text-emerald-600 hover:text-emerald-800 font-semibold"
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
