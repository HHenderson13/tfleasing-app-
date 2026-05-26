import { NextResponse } from "next/server";
import { sendMail } from "@/lib/email";
import { buildBuckets, buildHtml, buildText, hasContent, ukDateLabel } from "@/lib/daily-summary";
import { ensureAppSchema } from "@/db/ensure-schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// DST-aware schedule: vercel.json fires this at 06:30 UTC and 07:30 UTC. The
// ukHour gate below ensures only the one that lands at UK 07:xx runs the
// summary — in BST that's the 06:30 UTC tick; in GMT it's the 07:30 UTC tick.
// The other tick exits early with skipped: true.
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}` && req.headers.get("x-force") !== "1") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ukHour = parseInt(
    new Date().toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }),
    10,
  );
  if (ukHour !== 7 && req.headers.get("x-force") !== "1") {
    return NextResponse.json({ skipped: true, reason: `UK hour is ${ukHour}` });
  }
  // Cron skips middleware + getCurrentUser(), so ensureAppSchema() never runs
  // via a normal user request before this fires. Call it explicitly.
  await ensureAppSchema();

  const { buckets, execById, adminEmails } = await buildBuckets();

  let sent = 0;
  for (const [key, bucket] of buckets) {
    if (key === "ALL") continue;
    const exec = execById.get(key);
    if (!exec?.email) continue;
    if (!hasContent(bucket)) continue;
    await sendMail({
      to: exec.email,
      subject: `Daily orderbank summary — ${ukDateLabel(new Date())}`,
      text: buildText(exec.name, bucket, false),
      html: buildHtml(exec.name, bucket, false),
    });
    sent++;
  }

  const allBucket = buckets.get("ALL")!;
  let adminSent = 0;
  if (hasContent(allBucket)) {
    for (const a of adminEmails) {
      await sendMail({
        to: a.email,
        subject: `Daily orderbank — all execs — ${ukDateLabel(new Date())}`,
        text: buildText(a.name, allBucket, true),
        html: buildHtml(a.name, allBucket, true),
      });
      adminSent++;
    }
  }

  return NextResponse.json({ ok: true, sent, adminSent, considered: buckets.size - 1, admins: adminEmails.length });
}
