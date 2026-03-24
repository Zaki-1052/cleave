// frontend/src/contexts/AuthContext.tsx
import { createContext, useCallback, useEffect, useState, type ReactNode } from 'react';
import * as authApi from '@/api/auth';
import { setAccessToken } from '@/api/client';
import type { User } from '@/api/types';

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const u = await authApi.getMe();
      setUser(u);
    } catch {
      setUser(null);
      setAccessToken(null);
    }
  }, []);

  useEffect(() => {
    authApi.refresh()
      .then((res) => {
        setAccessToken(res.accessToken);
        return fetchUser();
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, [fetchUser]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setAccessToken(res.accessToken);
    await fetchUser();
  }, [fetchUser]);

  const register = useCallback(async (
    email: string, password: string, firstName?: string, lastName?: string,
  ) => {
    const res = await authApi.register(email, password, firstName, lastName);
    setAccessToken(res.accessToken);
    await fetchUser();
  }, [fetchUser]);

  const logout = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    authApi.logout().catch(() => {});
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, isLoading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
