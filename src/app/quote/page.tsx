import { listModels } from "@/lib/quote";
import { QuoteTabs } from "./quote-tabs";
import { PageShell, PageTitle } from "@/components/ui";
import { requireQuoteAccess } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export default async function QuotePage() {
  await requireQuoteAccess();
  const models = await listModels();
  return (
    <PageShell>
      <PageTitle title="Quote">
        Rank funders by monthly rental, or work out a broker commission from the rentals either side of it.
      </PageTitle>
      <QuoteTabs models={models} />
    </PageShell>
  );
}
