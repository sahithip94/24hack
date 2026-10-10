import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { PatientUser } from '../types';
import { apiFetch, getToken, setToken } from './api';

interface AuthState {
  user: PatientUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    name: string,
    email: string,
    password: string,
  ) => Promise<{ message: string }>;
  logOut: () => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PatientUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      // GET /auth/me validates the stored bearer token server-side.
      const body = await apiFetch<PatientUser>('/auth/me');
      setUser(body);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (getToken()) {
      void refreshUser();
    } else {
      setLoading(false);
    }
  }, [refreshUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    const body = await apiFetch<{
      access_token: string;
      token_type: string;
      expires_in_seconds: number;
      user: PatientUser;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(body.access_token);
    setUser(body.user);
  }, []);

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      // Register creates the account immediately (no email
      // verification). The account can log in right away; no
      // access token is issued here — that happens on login.
      const body = await apiFetch<{
        user: PatientUser;
        message: string;
      }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });
      return { message: body.message };
    },
    [],
  );

  const logOut = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      // Bearer tokens are stateless; deleting the stored token ends
      // this client's session (the backend documents this behavior).
      setToken(null);
      setUser(null);
    }
  }, []);

  const updateProfile = useCallback(async (name: string) => {
    const body = await apiFetch<PatientUser>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    setUser(body);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signUp, logOut, updateProfile, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
