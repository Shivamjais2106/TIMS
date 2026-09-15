'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Panel';
import { ErrorState, NoticeBanner } from '@/components/ui/States';
import { useAuth } from '@/hooks/useAuth';
import { useFadeIn } from '@/hooks/useGsap';
import { describeError } from '@/lib/api';

/**
 * Account request form.
 *
 * Self-service signup is limited to ANALYST and VIEWER. ADMIN cannot be
 * self-assigned, because ADMIN is what gates the manual data-sync endpoints
 * that call rate-limited third-party APIs and mutate the database.
 */
export function SignupForm() {
  const router = useRouter();
  const { signup } = useAuth();
  const panelRef = useFadeIn();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirm: '',
    role: 'VIEWER' as 'ANALYST' | 'VIEWER',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mismatch = form.confirm.length > 0 && form.confirm !== form.password;

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (mismatch) return;

    setError(null);
    setSubmitting(true);

    try {
      await signup({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      });
      router.replace('/dashboard');
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div ref={panelRef}>
      <Panel>
        <PanelHeader label="Account request" title="Create an account" />

        <PanelBody className="space-y-3">
          {error ? <ErrorState message={error} /> : null}

          <form onSubmit={onSubmit} className="space-y-3">
            <Input
              label="Full name"
              name="name"
              autoComplete="name"
              required
              minLength={2}
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="Priya Nair"
            />

            <Input
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(event) => update('email', event.target.value)}
              placeholder="analyst@example.gov.in"
            />

            <Select
              label="Role"
              name="role"
              value={form.role}
              onChange={(event) => update('role', event.target.value as 'ANALYST' | 'VIEWER')}
            >
              <option value="VIEWER">VIEWER — read-only access</option>
              <option value="ANALYST">ANALYST — can acknowledge alerts and generate reports</option>
            </Select>

            <Input
              label="Password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={form.password}
              onChange={(event) => update('password', event.target.value)}
              placeholder="••••••••"
              hint="At least 8 characters. Stored only as a bcrypt hash."
            />

            <Input
              label="Confirm password"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={form.confirm}
              onChange={(event) => update('confirm', event.target.value)}
              placeholder="••••••••"
              error={mismatch ? 'Passwords do not match' : undefined}
            />

            <Button
              type="submit"
              variant="primary"
              disabled={submitting || mismatch}
              className="w-full"
            >
              {submitting ? 'Creating account…' : 'Create account'}
            </Button>
          </form>

          <NoticeBanner label="Note" tone="info">
            ADMIN rights cannot be self-assigned. Only an administrator can trigger a manual NASA
            FIRMS or OpenStreetMap synchronisation.
          </NoticeBanner>

          <p className="text-[11px] text-fg-muted">
            Already registered?{' '}
            <Link href="/login" className="text-rust underline-offset-2 hover:underline">
              Sign in
            </Link>
          </p>
        </PanelBody>
      </Panel>
    </div>
  );
}
