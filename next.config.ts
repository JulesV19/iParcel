import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

// Seuls les services réellement appelés par l'app sont autorisés
const csp = [
  "default-src 'self'",
  // Les pages statiques de Next embarquent des scripts inline ; React a besoin d'eval en dev
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://server.arcgisonline.com",
  "font-src 'self'",
  [
    "connect-src 'self'",
    supabaseUrl,
    supabaseUrl.replace(/^https:/, "wss:"),
    "https://earth-search.aws.element84.com",
    "https://sentinel-cogs.s3.us-west-2.amazonaws.com",
    "https://api.open-meteo.com",
    "https://data.geopf.fr",
    isDev ? "ws:" : "",
  ].filter(Boolean).join(" "),
  // Widget anti-robot Cloudflare Turnstile (page de connexion)
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  isDev ? "" : "upgrade-insecure-requests",
].filter(Boolean).join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
