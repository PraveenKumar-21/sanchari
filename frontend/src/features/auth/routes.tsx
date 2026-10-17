import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageSpinner } from '@/components/layout/FullPageSpinner';
import { useMe } from './queries';

export function ProtectedRoute() {
  const { data: user, isPending } = useMe();
  const location = useLocation();
  if (isPending) return <FullPageSpinner />;
  if (!user) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }
  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { data: user, isPending } = useMe();
  if (isPending) return <FullPageSpinner />;
  if (user) return <Navigate to="/trips" replace />;
  return <Outlet />;
}

export function RootRedirect() {
  const { data: user, isPending } = useMe();
  if (isPending) return <FullPageSpinner />;
  return <Navigate to={user ? '/trips' : '/login'} replace />;
}
