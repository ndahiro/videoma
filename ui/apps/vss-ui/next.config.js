/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  // ffmpeg-static resolves its bundled binary relative to its own package
  // directory (via __dirname). Keep it out of the server bundle so that path
  // stays valid; otherwise lib/video-store's ffmpeg-static fallback breaks.
  serverExternalPackages: ['ffmpeg-static'],
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  // NOTE: the old `/` -> `/dashboard` redirect was removed when the SaaS
  // wrapper landed: `/` is now the public marketing/landing page and the
  // console lives behind the session gate at /dashboard, /videos, ...
};

module.exports = nextConfig;
