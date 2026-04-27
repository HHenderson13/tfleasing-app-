import type { ReactNode } from "react";
import { requireProposalsAccess } from "@/lib/auth-guard";

export default async function ProposalsLayout({ children }: { children: ReactNode }) {
  await requireProposalsAccess();
  return <>{children}</>;
}
