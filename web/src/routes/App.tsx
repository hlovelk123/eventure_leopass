import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

import { HomePage } from './HomePage';
import { AuthPage } from './AuthPage';

const MemberDashboardPage = lazy(() => import('./member/MemberDashboardPage').then((mod) => ({ default: mod.MemberDashboardPage })));
const MemberQrPage = lazy(() => import('./member/MemberQrPage').then((mod) => ({ default: mod.MemberQrPage })));
const StewardScannerPage = lazy(() => import('./steward/StewardScannerPage').then((mod) => ({ default: mod.StewardScannerPage })));
const AdminDashboardPage = lazy(() => import('./admin/AdminDashboardPage').then((mod) => ({ default: mod.AdminDashboardPage })));

export default function App(): JSX.Element {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/member" element={<MemberDashboardPage />} />
        <Route path="/member/events/:eventId/token" element={<MemberQrPage />} />
        <Route path="/steward/scan" element={<StewardScannerPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
      </Routes>
    </Suspense>
  );
}
