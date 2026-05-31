/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required for src/instrumentation.ts in Next 14.2 — installs the
  // undici RetryAgent that fixes the proxy `socket hang up` bursts.
  experimental: {
    instrumentationHook: true,
    // `undici` is bundled inside Next.js / Node itself; we don't want
    // webpack to try to walk into its `node:fs/promises` imports.
    serverComponentsExternalPackages: ["undici"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Force the instrumentation file to resolve undici at runtime via
      // Node's module system instead of bundling it.
      const existing = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [...existing, { undici: "commonjs undici" }];
    }
    return config;
  },
  async rewrites() {
    // Server-side proxy target for /api/*. Order matters:
    //  1. BACKEND_INTERNAL_URL — set in Docker to http://backend:5000 so
    //     SSR / direct-to-frontend requests reach the backend service over
    //     the compose network. NOT a NEXT_PUBLIC_* var, so it never leaks
    //     into the client bundle (the browser keeps calling relative
    //     /api/* through nginx).
    //  2. NEXT_PUBLIC_API_URL — honoured for native `npm run dev`.
    //  3. localhost:5000 — bare-metal dev fallback.
    const target =
      process.env.BACKEND_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:5000";
    return [
      {
        source: "/api/:path*",
        destination: `${target}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
