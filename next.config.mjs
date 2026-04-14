const allowed = process.env.ALLOWED_PLUGIN_ORIGIN ?? "*";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{
      source: "/api/:path*",
      headers: [
        { key: "Access-Control-Allow-Origin", value: allowed },
        { key: "Access-Control-Allow-Methods",
          value: "GET,POST,PUT,OPTIONS" },
        { key: "Access-Control-Allow-Headers",
          value: "Content-Type, Authorization, X-Sdk-Token" }
      ]
    }];
  }
};
export default nextConfig;
