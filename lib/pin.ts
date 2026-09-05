import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSettings } from "./settings";

/* The optional second lock. Signing in proves who you are; the PIN
   guards the screen from whoever is holding your unlocked phone.
   Pages call this before rendering anything with money on it. */
export async function requirePin() {
  const s = await getSettings();
  if (!s.pinHash) return;
  const jar = await cookies();
  if (jar.get("biblo_pin")?.value === s.pinHash) return;
  redirect("/pin");
}
