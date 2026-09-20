import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is used through `next dev`, not just developed in it,
  // so the floating dev badge sits on top of real UI all day.
  devIndicators: false,
  /* Vercel's image optimiser has its own monthly quota, and the only
     images here are the avatar pack (already sized) and receipts
     (streamed privately, never optimised). Serve the PNGs as they
     are and let the browser keep them for a year. */
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/(avatars|icons|brand)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  experimental: {
    // Every page here is dynamic, and since v15 the router keeps no
    // client cache for dynamic pages - each tab tap refetched Supabase.
    // A just-visited page is trustworthy for a minute: server actions
    // purge this cache on every write, and the chat poller refreshes
    // past it while anything is pending.
    staleTimes: { dynamic: 60, static: 60 },
  },
};

export default nextConfig;
