'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { ErrorState, NoticeBanner } from '@/components/ui/States';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import { useFadeIn } from '@/hooks/useGsap';
import { API_BASE_URL, describeError } from '@/lib/api';
import { bhopalService } from '@/services';

/**
 * Sign-in form.
 *
 * Credentials go to POST /api/auth/login, which verifies a bcrypt hash and
 * returns a JWT. There is no client-side demo bypass: signing a user in against
 * invented data would make every figure in the console untrustworthy.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, user } = useAuth();
  const panelRef = useFadeIn();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Probe the API on mount.
   *
   * Without this the form looks perfectly normal against a dead backend, and
   * the user only discovers the problem after typing credentials and clicking
   * Sign in. Telling them up front — with the command that fixes it — is the
   * difference between a confusing failure and an obvious one.
   */
  const health = useApi(() => bhopalService.health(), []);
  const apiDown = Boolean(health.error) && !health.loading;

  // Already signed in — skip the form.
  useEffect(() => {
    if (user) router.replace(params.get('next') ?? '/dashboard');
  }, [user, router, params]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login({ email: email.trim(), password });
      router.replace(params.get('next') ?? '/dashboard');
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div ref={panelRef}>
      <Panel>
        <PanelHeader label="Authentication" title="Sign in to the console" />

        <PanelBody className="space-y-3">
          {apiDown ? (
            <NoticeBanner label="Backend down" tone="danger">
              The API at <span className="tims-data">{API_BASE_URL}</span> is not answering, so
              sign-in will fail. Start it with <span className="tims-data">cd backend</span> then{' '}
              <span className="tims-data">npm run dev</span>, then reload this page.
            </NoticeBanner>
          ) : null}

          {error ? <ErrorState message={error} /> : null}

          <form onSubmit={onSubmit} className="space-y-3">
            <Input
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="analyst@tims.gov.in"
            />

            <Input
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />

            <Button
              type="submit"
              variant="primary"
              disabled={submitting || apiDown}
              className="w-full"
            >
              {submitting ? 'Signing in…' : apiDown ? 'Backend unavailable' : 'Sign in'}
            </Button>
          </form>

          <p className="text-[11px] text-fg-muted">
            No account?{' '}
            <Link href="/signup" className="text-rust underline-offset-2 hover:underline">
              Request access
            </Link>
          </p>
        </PanelBody>
      </Panel>

      {/* Seeded accounts. Present because this is a hackathon prototype an
          evaluator needs to open; a production deployment would not ship them. */}
      <Panel className="mt-3">
        <PanelHeader label="Evaluation accounts" />
        <PanelBody className="space-y-1.5">
          {[
            { role: 'ADMIN', email: 'admin@tims.gov.in', password: 'Admin@1234' },
            { role: 'ANALYST', email: 'analyst@tims.gov.in', password: 'Analyst@1234' },
            { role: 'VIEWER', email: 'viewer@tims.gov.in', password: 'Viewer@1234' },
          ].map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => {
                setEmail(account.email);
                setPassword(account.password);
              }}
              className="tims-row flex w-full items-center gap-2 border border-line px-2 py-1.5 text-left"
            >
              <span className="tims-label w-[52px] flex-none text-sage">
                {account.role}
              </span>
              <span className="tims-data flex-1 truncate text-[10px] text-fg-muted">
                {account.email}
              </span>
              <span className="tims-data flex-none text-[10px] text-fg-subtle">fill →</span>
            </button>
          ))}
          <p className="pt-1 text-[10px] leading-snug text-fg-subtle">
            Only ADMIN can trigger a manual data synchronisation.
          </p>
        </PanelBody>
      </Panel>
    </div>
  );
}
