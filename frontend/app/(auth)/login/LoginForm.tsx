'use client';

import { AtSign, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { describeError } from '@/lib/api';

/** Seeded accounts, shown so a reviewer can sign in without reading the README. */
const DEMO_ACCOUNTS = [
  { role: 'Administrator', email: 'admin@tims.gov.in', password: 'Admin@1234' },
  { role: 'Analyst', email: 'analyst@tims.gov.in', password: 'Analyst@1234' },
  { role: 'Viewer', email: 'viewer@tims.gov.in', password: 'Viewer@1234' },
];

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login({ email: email.trim().toLowerCase(), password });
      // `next` is set by the middleware when it intercepts a protected route.
      const next = searchParams.get('next');
      router.replace(next && next.startsWith('/dashboard') ? next : '/dashboard');
    } catch (cause) {
      setError(describeError(cause));
      setSubmitting(false);
    }
  }

  function useAccount(account: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Sign in</h1>
      <p className="mt-1.5 text-sm text-fg-muted">Access the thermal monitoring console.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
        <Input
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="analyst@tims.gov.in"
          icon={<AtSign className="size-4" aria-hidden />}
        />

        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
          icon={<KeyRound className="size-4" aria-hidden />}
        />

        {error ? (
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500 ring-1 ring-inset ring-red-500/25">
            {error}
          </p>
        ) : null}

        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? 'Signing in' : 'Sign in'}
        </Button>
      </form>

      <div className="mt-6 rounded-lg border border-line bg-surface-2 p-3">
        <p className="text-[11px] font-medium text-fg-muted">Seeded demo accounts</p>
        <ul className="mt-2 space-y-1">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email}>
              <button
                type="button"
                onClick={() => useAccount(account)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-surface-3"
              >
                <span className="font-medium text-fg">{account.role}</span>
                <span className="tims-data truncate text-fg-subtle">{account.email}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-6 text-sm text-fg-muted">
        No account yet?{' '}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Request access
        </Link>
      </p>
    </div>
  );
}
