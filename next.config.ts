import type { NextConfig } from "next";

// Cache Components is intentionally disabled: every workspace page is
// session-scoped and reads tenant data per request (see docs/DECISIONS.md ADR-003).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // The E2E production build uses its own folder: building into `.next` while `next dev`
  // runs from it sends the dev server into a reload loop.
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  // That E2E build skips its own type check; `npm run typecheck` covers the same code.
  typescript: { ignoreBuildErrors: Boolean(process.env.NEXT_DIST_DIR?.trim()) },
  poweredByHeader: false,
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
