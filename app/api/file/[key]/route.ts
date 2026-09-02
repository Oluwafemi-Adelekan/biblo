import { getFile } from "@/lib/store";

/* Attachments live in a private bucket and are streamed back through
   here rather than handed out as signed links. That way access is
   gated by the app itself, and a URL that leaks is worth nothing
   once the passcode is on. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  // The key is one path segment by construction; refuse anything
  // that tries to climb out of the bucket.
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(key)) {
    return new Response("Not found", { status: 404 });
  }

  const blob = await getFile(key);
  if (!blob) return new Response("Not found", { status: 404 });

  return new Response(blob, {
    headers: {
      "Content-Type": blob.type || "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
