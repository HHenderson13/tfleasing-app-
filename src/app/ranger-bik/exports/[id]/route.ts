import { requireUser } from "@/lib/auth-guard";
import { loadRangerExportPdf } from "@/lib/ranger-exports";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const found = /^[0-9a-f-]{36}$/.test(id) ? await loadRangerExportPdf(id) : null;
  if (!found) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(found.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(found.filename)}`,
      "cache-control": "private, no-store",
    },
  });
}
