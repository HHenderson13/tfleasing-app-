import { notFound } from "next/navigation";
import { canStock } from "@/lib/auth";
import { requireUser } from "@/lib/auth-guard";
import { ukNow } from "@/lib/customer-profiles";
import { canWork, getProfile, listProfileDocs, snapshotOf } from "@/lib/customer-profiles-store";
import { Workspace } from "./workspace";

export const dynamic = "force-dynamic";

/** When this request was served: the page's clock starts here, so the first paint matches the server's. */
const requestTime = () => Date.now();

// One customer. Anyone signed in can open it; the exec it belongs to and
// admins can change it (the actions check that, not this page).
export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const p = /^[0-9a-f-]{36}$/.test(id) ? await getProfile(id) : null;
  if (!p) notFound();
  const docs = (await listProfileDocs([p.id])).get(p.id) ?? [];
  return <Workspace initial={snapshotOf(p, docs)} now={ukNow()} nowMs={requestTime()} canEdit={canWork(user, p.ownerId)} mine={p.ownerId === user.id} canStock={canStock(user)} />;
}
