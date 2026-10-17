import { BrowserRouter, Route, Routes } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { StatusPage } from '@/routes/StatusPage';

export function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="*" element={<StatusPage />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
