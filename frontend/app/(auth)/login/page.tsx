import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoadingState } from '@/components/ui/LoadingState';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to the TIMS thermal monitoring console.',
};

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading" minHeight={320} />}>
      <LoginForm />
    </Suspense>
  );
}
