import type { Metadata } from 'next';
import { SignupForm } from './SignupForm';

export const metadata: Metadata = {
  title: 'Request access',
  description: 'Create a TIMS account to access the thermal monitoring console.',
};

export default function SignupPage() {
  return <SignupForm />;
}
