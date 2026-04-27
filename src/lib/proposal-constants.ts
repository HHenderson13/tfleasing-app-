export const PROPOSAL_STATUSES = [
  "proposal_received",
  "accepted",
  "declined",
  "referred_to_dealer",
  "referred_to_underwriter",
  "not_eligible",
  "lost_sale",
  "cancelled",
  "in_order",
  "awaiting_delivery",
  "delivered",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

// Statuses that belong to the Proposals section vs. the Orders section.
export const ORDER_STATUSES: ProposalStatus[] = ["in_order", "awaiting_delivery", "delivered"];
export const PROPOSAL_SECTION_STATUSES: ProposalStatus[] = [
  "proposal_received", "accepted", "declined", "referred_to_dealer", "referred_to_underwriter", "not_eligible", "lost_sale", "cancelled",
];

// Terminal statuses — no further transitions allowed.
export const TERMINAL_STATUSES: ProposalStatus[] = ["lost_sale", "not_eligible", "cancelled"];

export const STATUS_LABELS: Record<ProposalStatus, string> = {
  proposal_received: "Proposal received",
  accepted: "Accepted",
  declined: "Declined",
  referred_to_dealer: "Referred to dealer",
  referred_to_underwriter: "Referred to underwriter",
  not_eligible: "Not eligible",
  lost_sale: "Lost sale",
  cancelled: "Cancelled",
  in_order: "In order",
  awaiting_delivery: "Awaiting delivery",
  delivered: "Delivered",
};

const FALLBACK_STATUS_COLOR = { bg: "bg-slate-100", text: "text-slate-700", ring: "ring-slate-200" };
export function statusColor(status: string) {
  return (STATUS_COLORS as Record<string, { bg: string; text: string; ring: string }>)[status] ?? FALLBACK_STATUS_COLOR;
}
export function statusLabel(status: string) {
  return (STATUS_LABELS as Record<string, string>)[status] ?? status;
}
export const STATUS_COLORS: Record<ProposalStatus, { bg: string; text: string; ring: string }> = {
  proposal_received: { bg: "bg-slate-100", text: "text-slate-700", ring: "ring-slate-200" },
  accepted: { bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-200" },
  declined: { bg: "bg-red-100", text: "text-red-700", ring: "ring-red-200" },
  referred_to_dealer: { bg: "bg-amber-100", text: "text-amber-800", ring: "ring-amber-200" },
  referred_to_underwriter: { bg: "bg-indigo-100", text: "text-indigo-700", ring: "ring-indigo-200" },
  not_eligible: { bg: "bg-orange-100", text: "text-orange-800", ring: "ring-orange-200" },
  lost_sale: { bg: "bg-slate-200", text: "text-slate-600", ring: "ring-slate-300" },
  cancelled: { bg: "bg-rose-100", text: "text-rose-700", ring: "ring-rose-200" },
  in_order: { bg: "bg-blue-100", text: "text-blue-700", ring: "ring-blue-200" },
  awaiting_delivery: { bg: "bg-violet-100", text: "text-violet-700", ring: "ring-violet-200" },
  delivered: { bg: "bg-teal-100", text: "text-teal-700", ring: "ring-teal-200" },
};
