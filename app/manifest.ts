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
    /* Biblo in the phone's share sheet: "Share receipt" in a banking
       app lists Biblo next to WhatsApp, and the receipt lands in the
       chat without ever being saved to the gallery. Android only -
       iOS keeps web apps out of its share sheet. The POST is caught
       by the service worker (public/sw.js), never by a page. */
    share_target: {
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          {
            name: "files",
            accept: ["image/*", "application/pdf", "text/csv", ".csv"],
          },
        ],
      },
    },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
