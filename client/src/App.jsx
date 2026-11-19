import { Navigate, Route, Routes } from 'react-router-dom';
import TimerPage from './pages/TimerPage.jsx';
import ControlPage from './pages/ControlPage.jsx';
import LogosPage from './pages/LogosPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/timer" element={<TimerPage />} />
      <Route path="/control" element={<ControlPage />} />
      <Route path="/logos" element={<LogosPage />} />
      <Route path="/" element={<Navigate to="/timer" replace />} />
      <Route path="*" element={<Navigate to="/timer" replace />} />
    </Routes>
  );
}
