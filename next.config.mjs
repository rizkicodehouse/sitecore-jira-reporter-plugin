const allowed = process.env.ALLOWED_PLUGIN_ORIGIN
  ?? (process.env.NODE_ENV === "production"
        ? (() => { throw new Error(
            "ALLOWED_PLUGIN_ORIGIN is required in production"
          ); })()
        : "http://localhost:3002");

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
          { key: "Access-Control-Allow-Origin", value: allowed },
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
            value: `frame-ancestors ${allowed};`
          }
        ]
      }
    ];
  }
};
export default nextConfig;
