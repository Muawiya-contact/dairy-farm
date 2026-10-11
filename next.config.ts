import type { NextConfig } from "next";

// Static export for Netlify (publish folder: "out"); Supabase calls run in the browser.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
