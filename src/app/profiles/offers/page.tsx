import { requireAdmin } from "@/lib/auth-guard";
import { ukNow } from "@/lib/customer-profiles";
import { getMessageConfig, listOffers } from "@/lib/message-store";
import { BarLink, PageShell, PageTitle } from "@/components/ui";
import { OffersEditor } from "./editor";

export const dynamic = "force-dynamic";

// The bespoke offers the Day 1, 2 and 3 messages mention (user, 2026-11-06:
// "we need to be able to easily update the special offer messages"). Admins
// only; every exec sees the live ones in the message builder.
export default async function OffersPage() {
  await requireAdmin();
  const [offers, cfg] = await Promise.all([listOffers(), getMessageConfig()]);
  return (
    <PageShell back="/profiles" backLabel="Customer Profiles" width="5xl" bar={<BarLink href="/profiles/templates">Templates</BarLink>}>
      <PageTitle title="Offers">
        The bespoke offers the messages mention. Each shows on its models&apos; messages until its last day, and the exec chooses every time whether to mention it.
      </PageTitle>
      <OffersEditor initial={offers} today={ukNow().slice(0, 10)} config={cfg.config} />
    </PageShell>
  );
}
