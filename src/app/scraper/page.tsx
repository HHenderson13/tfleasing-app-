import { requireAdmin } from "@/lib/auth-guard";
import { ScraperClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ScraperPage() {
  await requireAdmin();
  return <ScraperClient />;
}
