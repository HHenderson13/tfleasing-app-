"use client";
import { Tabs } from "@/components/ui";
import { usePathname, useSearchParams } from "next/navigation";

// Two-tab selector for /orders/awaiting. Tab state lives in the ?view=
// query param so refresh and shared URLs keep the current view. Keeping
// it client-side avoids a server round-trip per tab toggle — the tracker
// and calendar payloads come down on the initial render together.
export type AwaitingView = "tracker" | "calendar";

export function ViewTabs({ active }: { active: AwaitingView }) {
  const pathname = usePathname();
  const params = useSearchParams();
  function hrefFor(view: AwaitingView) {
    const sp = new URLSearchParams(params.toString());
    if (view === "tracker") sp.delete("view");
    else sp.set("view", view);
    const q = sp.toString();
    return q ? `${pathname}?${q}` : pathname;
  }
  return (
    <Tabs label="View" value={active}
      items={[{ key: "tracker", label: "Delivery tracker", href: hrefFor("tracker") }, { key: "calendar", label: "Calendar", href: hrefFor("calendar") }]} />
  );
}
