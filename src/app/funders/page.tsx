import { requireAdmin } from "@/lib/auth-guard";
import { FundersClient } from "./client";

export const dynamic = "force-dynamic";

export default async function FundersPage() {
  await requireAdmin();
  return <FundersClient />;
}
