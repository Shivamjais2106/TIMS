import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingState } from '@/components/ui/States';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to the TIMS Bhopal monitoring console.',
};

export default function LoginPage() {
  return (
    // Suspense boundary: LoginForm reads useSearchParams for the ?next= redirect,
    // which opts the route into client rendering and requires a fallback.
    <Suspense fallback={<LoadingState label="Loading" />}>
      <LoginForm />
    </Suspense>
  );
}
