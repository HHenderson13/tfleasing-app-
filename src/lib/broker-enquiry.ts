// Builds the mailto: link behind the "Get a quote" and "Secure" buttons on
// every broker stock tile.
//
// mailto: rather than a form on our side, because it has to land in whatever
// the broker actually uses — Outlook desktop, Outlook web, Apple Mail, Gmail
// on a phone — and mailto is the only thing every one of those honours. The
// cost is that we cannot validate what they type, so the body is a template
// with labelled blanks and the real checking happens when a person reads it.

export const BROKER_ENQUIRY_TO = "broker@trustford.co.uk";

// Outlook on Windows truncates a mailto around 2,048 characters and gives no
// warning when it does — the mail simply opens with the end of the body
// missing, which for the "secure" route would silently drop the finance
// proposal instruction. Everything below is built to sit under this, and
// the options list (the only unbounded field) is trimmed to fit.
export const MAILTO_MAX = 1900;

export type EnquiryKind = "quote" | "secure";

export interface EnquiryVehicle {
  ref: string;
  model: string;
  variant?: string | null;
  derivative?: string | null;
  bodyStyle?: string | null;
  engine?: string | null;
  transmission?: string | null;
  drive?: string | null;
  colour?: string | null;
  options?: string[];
  availability?: string | null;
}

export interface EnquirySender {
  name: string;
  brokerName: string;
}

function line(label: string, value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v ? `${label.padEnd(14)}${v}` : null;
}

export function enquirySubject(kind: EnquiryKind, v: EnquiryVehicle): string {
  const what = [v.model, v.variant, v.derivative].filter(Boolean).join(" ");
  const prefix = kind === "secure" ? "SECURE" : "Quote request";
  return `${prefix} — ${what} (${v.ref})`;
}

// The blanks the broker fills in. Secure asks for everything a quote does
// plus what they sold it at, because that is the number that decides whether
// the deal actually works.
const QUOTE_FIELDS = [
  "Upfront (rentals in advance):",
  "Term (months):",
  "Annual mileage:",
  "Desired commission (+VAT):",
];
const SECURE_FIELDS = [
  "Upfront (rentals in advance):",
  "Term (months):",
  "Annual mileage:",
  "Commission (+VAT):",
  "Rental sold at:",
];

export function enquiryBody(kind: EnquiryKind, v: EnquiryVehicle, sender?: EnquirySender): string {
  const secure = kind === "secure";
  const spec = [
    line("Reference:", v.ref),
    line("Model:", v.model),
    line("Variant:", v.variant),
    line("Derivative:", v.derivative),
    line("Body style:", v.bodyStyle),
    line("Engine:", v.engine),
    line("Transmission:", v.transmission),
    line("Drive:", v.drive),
    line("Colour:", v.colour),
    line("Availability:", v.availability),
  ].filter(Boolean) as string[];

  const parts: string[] = [
    secure
      ? "Please secure the vehicle below. My figures are underneath."
      : "Please quote the vehicle below. My requirements are underneath.",
    "",
    "VEHICLE",
    ...spec,
  ];

  const opts = (v.options ?? []).filter(Boolean);
  if (opts.length) parts.push(line("Options:", opts.join(", "))!);

  parts.push(
    "",
    secure ? "DEAL — please complete before sending:" : "REQUIREMENTS — please complete before sending:",
    ...(secure ? SECURE_FIELDS : QUOTE_FIELDS),
  );

  if (secure) {
    parts.push(
      "",
      "IMPORTANT",
      "We cannot proceed without the full finance proposal form. Please attach",
      `it to this email, or send it to us separately quoting ${v.ref}.`,
    );
  }

  if (sender) {
    parts.push("", `Sent from the stock portal by ${sender.name}, ${sender.brokerName}.`);
  }

  return parts.join("\r\n");
}

// Trims the options list — the only field with no natural bound — until the
// whole URL fits. Options are the least load-bearing part of the message: a
// reference identifies the exact vehicle on our side regardless, so losing
// the tail of a long options list costs nothing, whereas losing the finance
// proposal instruction off the end of a "secure" mail costs a deal.
export function buildEnquiryMailto(
  kind: EnquiryKind,
  vehicle: EnquiryVehicle,
  sender?: EnquirySender,
  to: string = BROKER_ENQUIRY_TO,
): string {
  const url = (v: EnquiryVehicle) =>
    `mailto:${to}?subject=${encodeURIComponent(enquirySubject(kind, v))}` +
    `&body=${encodeURIComponent(enquiryBody(kind, v, sender))}`;

  let v = vehicle;
  let out = url(v);
  const opts = [...(vehicle.options ?? [])];
  while (out.length > MAILTO_MAX && opts.length > 0) {
    opts.pop();
    v = { ...vehicle, options: opts.length ? [...opts, "…"] : [] };
    out = url(v);
  }
  return out;
}
