'use client';

import { AtSign, Check, KeyRound, User, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { describeError } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Mirrors the backend's zod password policy so users see failures before submit. */
const RULES = [
  { label: 'At least 8 characters', test: (value: string) => value.length >= 8 },
  { label: 'One lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { label: 'One uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'One number', test: (value: string) => /\d/.test(value) },
];

export function SignupForm() {
  const router = useRouter();
  const { signup } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState<'ANALYST' | 'VIEWER'>('VIEWER');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const results = useMemo(() => RULES.map((rule) => ({ ...rule, passed: rule.test(password) })), [password]);
  const passwordValid = results.every((rule) => rule.passed);
  const mismatch = confirm.length > 0 && confirm !== password;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!passwordValid) {
      setError('Password does not meet the minimum requirements');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await signup({ name: name.trim(), email: email.trim().toLowerCase(), password, role });
      router.replace('/dashboard');
    } catch (cause) {
      setError(describeError(cause));
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-fg">Request access</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        Accounts are created with viewer or analyst rights. Administrator access is granted separately.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
        <Input
          label="Full name"
          name="name"
          autoComplete="name"
          required
          minLength={2}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Priya Nair"
          icon={<User className="size-4" aria-hidden />}
        />

        <Input
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@department.gov.in"
          icon={<AtSign className="size-4" aria-hidden />}
        />

        <Select
          label="Role"
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value as 'ANALYST' | 'VIEWER')}
        >
          <option value="VIEWER">Viewer — read-only access</option>
          <option value="ANALYST">Analyst — can create and edit records</option>
        </Select>

        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Choose a strong password"
          icon={<KeyRound className="size-4" aria-hidden />}
        />

        {password.length > 0 ? (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
            {results.map((rule) => (
              <li
                key={rule.label}
                className={cn('flex items-center gap-1.5 text-[11px]', rule.passed ? 'text-emerald-500' : 'text-fg-subtle')}
              >
                {rule.passed ? <Check className="size-3" aria-hidden /> : <X className="size-3" aria-hidden />}
                {rule.label}
              </li>
            ))}
          </ul>
        ) : null}

        <Input
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="Re-enter your password"
          icon={<KeyRound className="size-4" aria-hidden />}
          error={mismatch ? 'Passwords do not match' : undefined}
        />

        {error ? (
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500 ring-1 ring-inset ring-red-500/25">
            {error}
          </p>
        ) : null}

        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? 'Creating account' : 'Create account'}
        </Button>
      </form>

      <p className="mt-6 text-sm text-fg-muted">
        Already registered?{' '}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
