import { NextResponse } from "next/server";
import { putFile } from "@/lib/store";

/* Uploads go through a route handler, not a Server Action.

   Server Actions cap the request body at 1MB, which every photo a
   phone takes exceeds — that is what was silently breaking uploads.
   Route handlers have no such cap. Files land in a private Supabase
   bucket and are read back through /api/file. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX = 25 * 1024 * 1024;

/** Anything you might reasonably have a receipt in. */
const ALLOWED = [
  "image/",
  "application/pdf",
  "text/",
  "application/json",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/msword",
  "application/csv",
];

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  const uploads = form.getAll("files").filter((f): f is File => f instanceof File);
  if (uploads.length === 0) {
    return NextResponse.json({ error: "No file in the upload." }, { status: 400 });
  }

  const saved = [];
  for (const file of uploads) {
    if (file.size === 0) continue;
    if (file.size > MAX) {
      return NextResponse.json({ error: `${file.name} is over 25MB.` }, { status: 413 });
    }
    const type = file.type || "application/octet-stream";
    if (!ALLOWED.some((a) => type.startsWith(a))) {
      return NextResponse.json(
        { error: `Cannot take ${type || "that file type"} yet.` },
        { status: 415 },
      );
    }

    try {
      const key = await putFile(file);
      saved.push({
        name: file.name,
        type,
        size: file.size,
        url: `/api/file/${key}`,
      });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 502 });
    }
  }

  return NextResponse.json({ files: saved });
}
