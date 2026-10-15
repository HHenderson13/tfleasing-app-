import { requireQuoteAccess } from "@/lib/auth-guard";
import { loadFuelExportPdf } from "@/lib/fuel-exports";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireQuoteAccess();
  const { id } = await params;
  const found = /^[0-9a-f-]{36}$/.test(id) ? await loadFuelExportPdf(id) : null;
  if (!found) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(found.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(found.filename)}`,
      "cache-control": "private, no-store",
    },
  });
}
