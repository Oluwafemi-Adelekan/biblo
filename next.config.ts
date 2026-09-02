import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is used through `next dev`, not just developed in it,
  // so the floating dev badge sits on top of real UI all day.
  devIndicators: false,
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
