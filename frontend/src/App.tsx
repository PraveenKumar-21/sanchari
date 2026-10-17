import { BrowserRouter, Route, Routes } from 'react-router';
import { AppShell, CenteredLayout } from '@/components/layout/AppShell';
import { ProtectedRoute, PublicOnlyRoute, RootRedirect } from '@/features/auth/routes';
import { LoginPage, SignupPage } from '@/routes/AuthPages';
import { NotFoundPage } from '@/routes/NotFoundPage';
import { TripListPage } from '@/routes/TripListPage';

// Route table: frontend-spec §3.
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route element={<PublicOnlyRoute />}>
          <Route element={<CenteredLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/trips" element={<TripListPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
