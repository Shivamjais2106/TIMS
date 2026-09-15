import type { Metadata } from 'next';
import { SettingsClient } from './SettingsClient';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Profile, pilot configuration and system capabilities.',
};

export default function SettingsPage() {
  return <SettingsClient />;
}
