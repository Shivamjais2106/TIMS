import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The repository root also has a package-lock.json (for the convenience
  // scripts), so Turbopack is told explicitly which directory is the app root.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
