import { requireAdmin } from "@/lib/auth-guard";
import { ukNow } from "@/lib/customer-profiles";
import { getMessageConfig, senderFor } from "@/lib/message-store";
import { BarLink, PageShell } from "@/components/ui";
import { TemplatesEditor } from "./editor";

export const dynamic = "force-dynamic";

// Every word the message builder writes, for admins to change (user,
// 2026-11-06: "an admin section so all parts of the templates, questions etc
// can be changed"). Only what's changed is stored; the rest follows the
// standard wording in lib/message-config.ts.
export default async function TemplatesPage() {
  const user = await requireAdmin();
  const [state, sender] = await Promise.all([getMessageConfig(), senderFor(user)]);
  return (
    <PageShell back="/profiles" backLabel="Customer Profiles" width="7xl" bar={<BarLink href="/profiles/offers">Offers</BarLink>}>
      <TemplatesEditor initial={state} sender={sender} today={ukNow().slice(0, 10)} />
    </PageShell>
  );
}
