import { Route, Routes } from 'react-router-dom';

import { HomePage } from './HomePage';

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
    </Routes>
  );
}
