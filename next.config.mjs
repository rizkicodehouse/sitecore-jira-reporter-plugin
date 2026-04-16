const allowedRaw = process.env.ALLOWED_PLUGIN_ORIGIN
  ?? (process.env.NODE_ENV === "production"
        ? (() => { throw new Error(
            "ALLOWED_PLUGIN_ORIGIN is required in production"
          ); })()
        : "http://localhost:3002");

// Space-separated list. CSP `frame-ancestors` takes the full
// list; CORS `Access-Control-Allow-Origin` takes the first
// entry (used for cross-origin API calls from the Sitecore
// host, which in practice is a single origin per host
// surface).
const allowedOrigins = allowedRaw
  .split(/\s+/).map((s) => s.trim()).filter(Boolean);
const corsOrigin = allowedOrigins[0] ?? "";
const frameAncestors = allowedOrigins.join(" ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok.app",
    "*.ngrok.io"
  ],
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: corsOrigin },
          { key: "Access-Control-Allow-Methods",
            value: "GET,POST,PUT,OPTIONS" },
          { key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, X-Sdk-Token" }
        ]
      },
      {
        source: "/((?!api).*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${frameAncestors};`
          }
        ]
      }
    ];
  }
};
export default nextConfig;
