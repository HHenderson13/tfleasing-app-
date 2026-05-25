import { requireAdmin } from "@/lib/auth-guard";
import { FundersClient } from "./client";

export const dynamic = "force-dynamic";

export default async function FundersPage() {
  const user = await requireAdmin();
  return <FundersClient userName={user.name ?? user.email} />;
}
