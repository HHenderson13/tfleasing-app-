import { renderFinanceQuotePage } from "../finance-page";

export const dynamic = "force-dynamic";

export default async function PcpQuotePage(props: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ term?: string; mileage?: string }>;
}) {
  return renderFinanceQuotePage({ ...props, route: "pcp" });
}
