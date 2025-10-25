import { Route, Routes } from 'react-router-dom';

import { HomePage } from './HomePage';
import { AuthPage } from './AuthPage';
import { MemberDashboardPage } from './member/MemberDashboardPage';
import { MemberQrPage } from './member/MemberQrPage';
import { StewardScannerPage } from './steward/StewardScannerPage';

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/member" element={<MemberDashboardPage />} />
      <Route path="/member/events/:eventId/token" element={<MemberQrPage />} />
      <Route path="/steward/scan" element={<StewardScannerPage />} />
    </Routes>
  );
}
