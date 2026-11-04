import type { ReactNode } from "react";
import { AppBar, type PageWidth } from "./ui";

/** The "‹ Home" bar every section shares (components/ui.tsx). `active` is kept for the pages that still pass it. */
export function TopNav({ width = "6xl", children }: { active?: string; width?: PageWidth; children?: ReactNode } = {}) {
  return <AppBar width={width}>{children}</AppBar>;
}
