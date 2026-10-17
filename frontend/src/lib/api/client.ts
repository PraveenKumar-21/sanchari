// Thin fetch wrapper (frontend-spec §2, §11). Every non-2xx becomes an ApiError in the contract's shape.

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown[] = [],
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = { method?: string; body?: unknown; signal?: AbortSignal };

/** Request against any API path (e.g. '/api/health'); `api()` below adds the v1 base. */
export async function request<T>(
  path: string,
  { method = 'GET', body, signal }: RequestOptions = {},
) {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server');
  }

  if (res.status === 204) return undefined as T;
  const payload: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown[] } })
      ?.error;
    const retryAfter = Number(res.headers.get('retry-after')) || undefined;
    throw new ApiError(
      res.status,
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? 'Something went wrong',
      error?.details ?? [],
      retryAfter,
    );
  }
  return payload as T;
}

/** Versioned API call; unwraps the `{ data }` envelope. */
export async function api<T>(path: string, options?: RequestOptions): Promise<T> {
  const payload = await request<{ data: T } | undefined>(`${API_BASE}${path}`, options);
  return payload?.data as T;
}
