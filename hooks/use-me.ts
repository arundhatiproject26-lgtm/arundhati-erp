'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/auth-fetch';
import { loadSession } from '@/lib/cognito-client';
import type { Me } from '@/lib/auth';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/auth/me'),
    enabled: typeof window !== 'undefined' && loadSession() !== null,
    staleTime: 5 * 60_000,
  });
}
