"use client";

/* Catches the rare case where the root layout itself fails, which is
   below the reach of app/error.tsx. It has to render its own <html>
   and cannot rely on the app's CSS having loaded, so everything is
   inline and dependency-free. Palette values are the design tokens,
   hand-carried. */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#b4b9a4",
          color: "#16180f",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "0 2rem",
        }}
      >
        <p style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
          Biblo hit a snag.
        </p>
        <p style={{ fontSize: ".85rem", opacity: 0.7, maxWidth: "30ch" }}>
          Usually a hiccup rather than a problem. Your money is safe where it
          is.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: "1.25rem",
            background: "#16180f",
            color: "#deddcc",
            border: 0,
            padding: ".9rem 1.6rem",
            fontSize: ".7rem",
            letterSpacing: ".14em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
        {error.digest ? (
          <p style={{ marginTop: "1.5rem", fontSize: ".65rem", opacity: 0.4 }}>
            ref {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
