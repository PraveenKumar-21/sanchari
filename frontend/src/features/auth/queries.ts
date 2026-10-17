import type { LoginInput, SignupInput, User } from '@sanchari/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api/client';

export const meQueryKey = ['me'] as const;

/** The Session (frontend-spec §8): the User, or null when logged out. */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: async (): Promise<User | null> => {
      try {
        return await api<User>('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

function useSessionMutation<TInput>(path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => api<User>(path, { method: 'POST', body: input }),
    onSuccess: (user) => {
      // A new Session: drop anything cached for a previous User.
      queryClient.clear();
      queryClient.setQueryData(meQueryKey, user);
    },
  });
}

export const useLogin = () => useSessionMutation<LoginInput>('/auth/login');
export const useSignup = () => useSessionMutation<SignupInput>('/auth/signup');

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(meQueryKey, null);
    },
  });
}
