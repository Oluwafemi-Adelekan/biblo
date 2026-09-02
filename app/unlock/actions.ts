"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, MAX_AGE, same, token } from "@/lib/auth";

export async function unlock(_prev: unknown, form: FormData) {
  const given = String(form.get("passcode") ?? "");
  const to = String(form.get("to") ?? "/");

  const passcode = process.env.BIBLO_PASSCODE;
  const secret = process.env.BIBLO_SESSION_SECRET;
  if (!passcode || !secret) {
    return { ok: false as const, error: "No passcode is configured on the server." };
  }

  // A short pause on every attempt, right or wrong, so the door
  // cannot be rattled thousands of times a second.
  await new Promise((r) => setTimeout(r, 400));

  if (!same(given, passcode)) {
    return { ok: false as const, error: "That is not it." };
  }

  const jar = await cookies();
  jar.set(COOKIE, await token(secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });

  // Only ever back into this app, never to a URL someone supplied.
  redirect(to.startsWith("/") && !to.startsWith("//") ? to : "/");
}
