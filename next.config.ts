import type { NextConfig } from "next";

// Static export so the preview can be hosted free on Netlify (publish folder: "out").
// When we add Supabase later, this can stay static (client-side calls) or move to a server build.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
