import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { toast } from 'sonner';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { meQueryKey } from '@/features/auth/queries';
import { ApiError } from '@/lib/api/client';
import { App } from './App';
import './index.css';

/**
 * Session expiry (frontend-spec §8): any UNAUTHORIZED response clears the cache and marks the
 * User logged out; ProtectedRoute then redirects to /login?returnTo=….
 */
function onApiError(err: unknown) {
  if (!(err instanceof ApiError) || err.code !== 'UNAUTHORIZED') return;
  if (queryClient.getQueryData(meQueryKey) === null) return;
  queryClient.clear();
  queryClient.setQueryData(meQueryKey, null);
  toast.error('Your session has expired, please log in again');
}

// Defaults per frontend-spec §6.2.
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
