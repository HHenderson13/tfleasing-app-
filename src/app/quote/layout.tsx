import type { ReactNode } from "react";
import { requireQuoteAccess } from "@/lib/auth-guard";

export default async function QuoteLayout({ children }: { children: ReactNode }) {
  await requireQuoteAccess();
  return <>{children}</>;
}
