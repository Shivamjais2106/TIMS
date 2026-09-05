'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEMO_MODE, NetworkError } from '@/lib/api';
import { cacheUserSummary, clearToken, getToken, parseExpiryDays, readCachedUserSummary, setToken } from '@/lib/auth';
import { MOCK_USER } from '@/lib/mockData';
import { authService, type LoginPayload, type SignupPayload } from '@/services/auth.service';
import type { Role, User } from '@/types';

interface AuthContextValue {
  user: User | null;
  /** True until the initial session check has settled. */
  loading: boolean;
  /** True when running against bundled sample data because the API is down. */
  demo: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);

  // Restores the session on mount. The cached cookie summary is used only to
  // avoid an empty header on first paint; /auth/me is still the source of truth.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const token = getToken();

      if (!token) {
        if (DEMO_MODE) {
          setUser(MOCK_USER as User);
          setDemo(true);
        }
        setLoading(false);
        return;
      }

      const cached = readCachedUserSummary();
      if (cached) {
        setUser((current) => current ?? ({ id: 'pending', ...cached, createdAt: '', updatedAt: '' } as User));
      }

      try {
        const { user: fresh } = await authService.me();
        if (cancelled) return;
        setUser(fresh);
        setDemo(false);
        cacheUserSummary({ name: fresh.name, email: fresh.email, role: fresh.role });
      } catch (error) {
        if (cancelled) return;
        if (DEMO_MODE && error instanceof NetworkError) {
          setUser(MOCK_USER as User);
          setDemo(true);
        } else {
          clearToken();
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const applySession = useCallback((result: { user: User; token: string; expiresIn: string }) => {
    setToken(result.token, parseExpiryDays(result.expiresIn));
    cacheUserSummary({ name: result.user.name, email: result.user.email, role: result.user.role });
    setUser(result.user);
    setDemo(false);
  }, []);

  const login = useCallback(
    async (payload: LoginPayload) => {
      applySession(await authService.login(payload));
    },
    [applySession],
  );

  const signup = useCallback(
    async (payload: SignupPayload) => {
      applySession(await authService.signup(payload));
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      // Best effort: the token is discarded locally regardless of the response.
      await authService.logout();
    } catch {
      // Ignored on purpose.
    }
    clearToken();
    setUser(null);
    setDemo(false);
    router.replace('/login');
  }, [router]);

  const hasRole = useCallback((...roles: Role[]) => (user ? roles.includes(user.role) : false), [user]);

  const value = useMemo(
    () => ({ user, loading, demo, login, signup, logout, hasRole }),
    [user, loading, demo, login, signup, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
