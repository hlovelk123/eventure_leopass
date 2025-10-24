import { Route, Routes } from 'react-router-dom';

import { HomePage } from './HomePage';
import { AuthPage } from './AuthPage';

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/auth" element={<AuthPage />} />
    </Routes>
  );
}
