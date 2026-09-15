import type { Metadata } from 'next';
import { SignupForm } from './SignupForm';

export const metadata: Metadata = {
  title: 'Request access',
  description: 'Create a TIMS analyst or viewer account.',
};

export default function SignupPage() {
  return <SignupForm />;
}
