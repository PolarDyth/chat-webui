import type { NextConfig } from "next";

/** The browser talks to Supabase Auth directly (project URL + anon key are
 *  public by design), and OAuth avatars come off the provider CDNs. */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const connectSrc = ["'self'", ...(supabaseUrl ? [supabaseUrl] : [])];
const avatarSrc = "https://avatars.githubusercontent.com https://lh3.googleusercontent.com";

/** Hardening headers on everything; CSP starts report-only so violations can
 *  be tuned in the console before enforcing. */
const securityHeaders = [
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${avatarSrc}`,
      "font-src 'self' data:",
      `connect-src ${connectSrc.join(" ")}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
