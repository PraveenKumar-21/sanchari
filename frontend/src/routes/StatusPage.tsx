// Phase 0 placeholder: proves the frontend → API → database path end to end.
import type { HealthResponse } from '@sanchari/shared';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { request } from '@/lib/api/client';

function useHealth(path: string) {
  return useQuery({
    queryKey: ['health', path],
    queryFn: () => request<HealthResponse>(path),
    retry: false,
  });
}

function StatusLine({ label, path }: { label: string; path: string }) {
  const { data, isPending, isError } = useHealth(path);
  const text = isPending ? 'checking…' : isError ? 'unavailable' : data.status;
  const ok = !isPending && !isError && data.status === 'ok';
  return (
    <p>
      {label}:{' '}
      <span className={ok ? 'font-medium text-primary' : 'text-muted-foreground'}>{text}</span>
    </p>
  );
}

export function StatusPage() {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">Sanchari is on its way</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <StatusLine label="API" path="/api/health" />
        <StatusLine label="DB" path="/api/health/ready" />
      </CardContent>
    </Card>
  );
}
