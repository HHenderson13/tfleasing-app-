// Labels of custom "delivery" stage checks that have since been promoted
// to core toggle cards on the tracker (PDI / FD / Invoiced / ITC / Taxed)
// or to dedicated gate booleans (delivery pack submitted, delivery
// details checked). The promoted core fields are the source of truth, so
// any custom check matching one of these labels should be:
//
//   • hidden from the tracker UI (avoids the user toggling the same thing
//     twice with different effects)
//   • IGNORED by the server-side "all delivery checks ticked" gate when
//     moving a deal to delivered (otherwise a legacy custom check def
//     left in the admin table silently blocks the transition even though
//     the equivalent core field is ticked)
//
// Matching is case-insensitive after stripping punctuation + collapsing
// runs of whitespace. Mirror this behaviour in BOTH places that consume
// the set so the UI and the server stay in sync.

export const DEDUP_DELIVERY_CHECK_LABELS = new Set([
  "pdi", "pdi plates", "pdi plates pushed", "pdi done",
  "fd", "finance docs", "finance docs signed",
  "invoiced",
  "itc", "itc complete",
  "taxed",
  "delivery pack", "delivery pack submitted", "delivery pack submitted to funder",
  "delivery details checked", "details checked",
]);

export function normaliseCheckLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isDedupedDeliveryCheck(label: string): boolean {
  return DEDUP_DELIVERY_CHECK_LABELS.has(normaliseCheckLabel(label));
}
