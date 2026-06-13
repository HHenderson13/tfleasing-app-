// Shared types between the server-side data prep and the client tracker
// + calendar views. Match is the stock-match snapshot for a single proposal
// — the page hands it to the client serialised as JSON so dates become
// strings and we keep the shape uniform on either side.

export interface Match {
  delivered: boolean;
  etaAt: string | null;              // ISO string (was Date on the server)
  location: string | null;
  source: "stock-vin" | "stock-order" | "manual" | "none";
  interestBearingAt: string | null;
  adoptedAt: string | null;
  registeredReview: boolean;
}
