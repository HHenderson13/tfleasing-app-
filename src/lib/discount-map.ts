/**
 * Default discount-id lookup keyed by vehicle.model. Used when the vehicle row
 * has no explicit `discount_key` set. Admin can override per-vehicle later.
 * Keys MUST match ids in `model_discounts`.
 */
const MAP: Record<string, string> = {
  "Puma": "puma-ice",
  "Puma ST": "puma-st",
  "Puma Gen-E": "puma-gen-e-premium", // admin should refine Select vs Premium
  "Kuga": "kuga-ice-fhev",
  "Kuga PHEV": "kuga-phev",
  "Focus": "focus",
  "Focus ST": "focus-st",
  "Mustang Mach-E": "mach-e-premium-gt",
  "Mustang Mach-E Select": "mach-e-select",
  "Mustang": "mach-e-premium-gt",
  "Ford Capri": "capri-new-my-std",
  "Capri": "capri-new-my-std",
  "Ford Explorer": "explorer-new-my-std",
  "Explorer": "explorer-new-my-std",
  "Ranger 2.0L": "ranger-2-0l",
  "Ranger 3.0L": "ranger-3-0l",
  "Ranger MS-RT": "ranger-ms-rt",
  "Ranger Raptor": "ranger-raptor",
  "Ranger PHEV": "ranger-phev-top",
  "Transit": "transit-van",
  "Transit (V363)": "transit-van",
  "E-Transit": "e-transit",
  "Transit Connect": "transit-connect-ice",
  "Transit Connect PHEV": "transit-connect-phev-l1",
  "Transit Courier": "transit-courier-ice",
  "E-Transit Courier": "e-transit-courier",
  "Tourneo Connect": "transit-connect-ice",
  "Tourneo Courier": "transit-courier-ice",
  "E-Tourneo Courier": "e-transit-courier",
  "Transit Custom": "transit-custom-ice-ltts",
  "Transit Custom PHEV": "transit-custom-phev",
  "Transit Custom DCiV": "transit-custom-dciv",
  "Transit E-Custom": "e-transit-custom",
  "Transit Custom MS-RT": "transit-custom-ms-rt-ice",
  "Transit Custom MS-RT PHEV": "transit-custom-ms-rt-phev",
  "Transit E-Custom MS-RT": "e-transit-custom-ms-rt",
};

export function defaultDiscountKey(model: string): string | null {
  return MAP[model] ?? null;
}
