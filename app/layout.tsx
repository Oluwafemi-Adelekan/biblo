import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { BottomNav } from "@/components/BottomNav";
import { getMonth } from "@/lib/data";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Biblo",
  description: "Type what you spent. That is the whole app.",
};

export const viewport: Viewport = {
  themeColor: "#B4B9A4",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const m = await getMonth();

  return (
    <html lang="en" className={archivo.variable}>
      <body className="bg-sage-dim">
        <div className="mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-sage shadow-[0_0_0_1px_var(--color-rule)]">
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            {children}
          </main>
          <BottomNav pending={m.pending.length} />
        </div>
      </body>
    </html>
  );
}
