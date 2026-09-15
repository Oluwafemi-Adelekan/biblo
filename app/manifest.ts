import type { MetadataRoute } from "next";

/* What makes "Add to Home screen" install Biblo as a real app - its
   own icon and name, opening full-screen without browser chrome -
   instead of a bare shortcut into a browser tab. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Biblo",
    short_name: "Biblo",
    description: "Type what you spent. That is the whole app.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#B4B9A4",
    theme_color: "#B4B9A4",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
