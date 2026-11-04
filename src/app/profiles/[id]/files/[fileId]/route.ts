import { getCurrentUser } from "@/lib/auth";
import { getFile, getProfile, readChunk } from "@/lib/customer-profiles-store";

// A part exchange appraisal. Anyone signed in can open a profile, so anyone
// signed in can open its appraisal.
// Streamed a piece at a time, so a large PDF never has to sit in memory whole.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first", { status: 401 });
  const { id, fileId } = await params;
  const uuid = /^[0-9a-f-]{36}$/;
  const f = uuid.test(fileId) && uuid.test(id) ? await getFile(fileId) : null;
  const p = f && f.complete && f.profileId === id ? await getProfile(id) : null;
  if (!f || !p) return new Response("Not found", { status: 404 });
  let seq = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (seq >= f.chunks) { controller.close(); return; }
      const bytes = await readChunk(f.id, seq++);
      if (!bytes) { controller.error(new Error("Missing piece")); return; }
      controller.enqueue(bytes);
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(f.size),
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      "cache-control": "private, no-store",
    },
  });
}
