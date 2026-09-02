import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is used through `next dev`, not just developed in it,
  // so the floating dev badge sits on top of real UI all day.
  devIndicators: false,
};

export default nextConfig;
