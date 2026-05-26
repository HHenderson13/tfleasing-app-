import { NextResponse } from "next/server";
import { sendMail } from "@/lib/email";
import { buildBuckets, buildHtml, buildText, ukDateLabel } from "@/lib/daily-summary";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Admin-only preview tool — sends a real email, so it's gated to admins to
// stop authenticated non-admins (or anonymous callers under /api/cron/*) from
// using us as an email-sending oracle.
export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const to = url.searchParams.get("to");
  const exec = url.searchParams.get("exec");
  if (!to) return NextResponse.json({ error: "missing ?to=" }, { status: 400 });

  const { buckets, execById } = await buildBuckets();
  const isAdmin = !exec;
  const key = exec ?? "ALL";
  const bucket = buckets.get(key);
  if (!bucket) return NextResponse.json({ error: `no bucket for ${key}` }, { status: 404 });

  const name = exec ? execById.get(exec)?.name ?? "there" : "there";
  await sendMail({
    to,
    subject: isAdmin
      ? `Daily orderbank — all execs (preview) — ${ukDateLabel(new Date())}`
      : `Daily orderbank summary (preview) — ${ukDateLabel(new Date())}`,
    text: buildText(name, bucket, isAdmin),
    html: buildHtml(name, bucket, isAdmin),
  });

  return NextResponse.json({
    ok: true,
    to,
    isAdmin,
    inOrderCount: bucket.inOrderCount,
    awaitingCount: bucket.awaitingCount,
    actions: {
      motorComplete: bucket.motorComplete.length,
      financeAgreement: bucket.financeAgreement.length,
      novunaChip: bucket.novunaChip.length,
      vehicleIds: bucket.vehicleIds.length,
    },
  });
}
