import { vi } from 'vitest';
import { createSupabaseMock, type ResultsByTable, type SupabaseMock } from './supabase';

export interface AuthUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

export interface ServerMock extends Omit<SupabaseMock, 'auth'> {
  auth: {
    admin: SupabaseMock['auth']['admin'];
    getUser: ReturnType<typeof vi.fn>;
    signInWithPassword: ReturnType<typeof vi.fn>;
    signUp: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
    resetPasswordForEmail: ReturnType<typeof vi.fn>;
  };
}

/**
 * Cliente de servidor (`createClient`). Reutiliza el builder encadenable del mock
 * de admin y agrega la API de autenticación.
 */
export function createServerClientMock(results: ResultsByTable = {}): ServerMock {
  const base = createSupabaseMock(results);

  return Object.assign(base, {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      signInWithPassword: vi.fn(async () => ({ data: { user: null }, error: null })),
      signUp: vi.fn(async () => ({ data: { user: null }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
      updateUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    },
  });
}

export function authUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return { id: 'u-1', email: 'user@test.com', user_metadata: {}, ...overrides };
}
