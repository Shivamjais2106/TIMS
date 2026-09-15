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
import { NetworkError } from '@/lib/api';
import {
  cacheUserSummary,
  clearToken,
  getToken,
  parseExpiryDays,
  readCachedUserSummary,
  setToken,
} from '@/lib/auth';
import { authService, type LoginPayload, type SignupPayload } from '@/services/auth.service';
import type { Role, User } from '@/types';

interface AuthContextValue {
  user: User | null;
  /** True until the initial session check has settled. */
  loading: boolean;
  /**
   * True when the API could not be reached at all, as distinct from "not
   * signed in". The two need different handling: a missing session should
   * redirect to /login, but an unreachable API must not — /login cannot sign
   * anyone in either, so redirecting produces a loop that renders as a blank
   * screen.
   */
  apiUnreachable: boolean;
  /** Re-runs the session check. Used by the "backend unreachable" screen. */
  retry: () => void;
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
  const [apiUnreachable, setApiUnreachable] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Restores the session on mount. The cached cookie summary is used only to
  // avoid an empty header on first paint; /auth/me is still the source of truth.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const token = getToken();

      if (!token) {
        // No token means signed out. There is deliberately no demo-user
        // fallback: signing a user in against invented data would make the
        // whole dashboard untrustworthy.
        //
        // The API is still probed, so a signed-out visitor hitting a dead
        // backend is told the backend is dead rather than being sent to a
        // login form that cannot work.
        try {
          await authService.me();
        } catch (error) {
          if (!cancelled && error instanceof NetworkError) setApiUnreachable(true);
        }
        if (!cancelled) setLoading(false);
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
        setApiUnreachable(false);
        cacheUserSummary({ name: fresh.name, email: fresh.email, role: fresh.role });
      } catch (error) {
        if (cancelled) return;

        // A NetworkError means the server never answered, so the token may
        // still be perfectly valid — discarding it would sign the user out for
        // an outage they had nothing to do with.
        if (error instanceof NetworkError) {
          setApiUnreachable(true);
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
  }, [attempt]);

  const applySession = useCallback((result: { user: User; token: string; expiresIn: string }) => {
    setApiUnreachable(false);
    setToken(result.token, parseExpiryDays(result.expiresIn));
    cacheUserSummary({ name: result.user.name, email: result.user.email, role: result.user.role });
    setUser(result.user);
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
    router.replace('/login');
  }, [router]);

  const hasRole = useCallback((...roles: Role[]) => (user ? roles.includes(user.role) : false), [user]);

  const retry = useCallback(() => {
    setLoading(true);
    setApiUnreachable(false);
    setAttempt((value) => value + 1);
  }, []);

  const value = useMemo(
    () => ({ user, loading, apiUnreachable, retry, login, signup, logout, hasRole }),
    [user, loading, apiUnreachable, retry, login, signup, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
