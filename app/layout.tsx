import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { BottomNav } from "@/components/BottomNav";
import { getSettings } from "@/lib/settings";
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
  /* This fetch exists to put a dot on the chat tab. If it fails, the
     right outcome is no dot - not the platform's crash page over the
     entire app, which is what an unhandled throw here produces. */
  let pending = 0;
  let hideIncome = false;
  let avatar: string | null = null;
  try {
    const s = await getSettings();
    hideIncome = s.hideIncome;
    avatar = s.avatar ?? null;
  } catch {}
  try {
    const m = await getMonth();
    pending = m.pending.length;
  } catch {
    pending = 0;
  }

  return (
    <html lang="en" className={archivo.variable}>
      <body className="bg-sage-dim" data-hide-income={hideIncome ? "1" : "0"}>
        {/* Phone: the familiar column. Desktop (lg+): the nav becomes
            a left rail and the column widens to a comfortable page,
            purely additive - the phone classes are untouched. */}
        <div className="mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-sage shadow-[0_0_0_1px_var(--color-rule)] lg:max-w-none lg:flex-row lg:bg-sage-dim lg:shadow-none">
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain lg:order-2 lg:items-center">
            <div className="flex w-full flex-1 flex-col lg:max-w-[680px] lg:bg-sage lg:shadow-[0_0_0_1px_var(--color-rule)]">
              {children}
            </div>
          </main>
          <BottomNav pending={pending} avatar={avatar} />
        </div>
      </body>
    </html>
  );
}
