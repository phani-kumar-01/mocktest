import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

const StudentApp = lazy(() => import('./student/index.js'));
const AdminApp = lazy(() => import('./admin/index.js'));

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading Student Portal...</div>}>
        <StudentApp />
      </Suspense>
    )
  },
  {
    path: '/admin/*',
    element: (
      <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading Admin Portal...</div>}>
        <AdminApp />
      </Suspense>
    )
  },
  {
    path: '*',
    element: <Navigate to="/" replace />
  }
]);
