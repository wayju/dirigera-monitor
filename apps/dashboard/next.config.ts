import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,

  // Transpile packages that may use modern JS features
  transpilePackages: ['recharts', 'd3-scale', 'd3-shape', 'd3-path', 'date-fns'],

  // Configure compiler options
  compiler: {
    // Remove console logs in production for performance
  },
};

export default nextConfig;
