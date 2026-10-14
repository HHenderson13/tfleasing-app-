import { createHash } from "node:crypto";

/**
 * A library vehicle's id: what it is, not when it was added — so the same
 * vehicle pasted in twice updates one row instead of making two.
 */
export function fuelVehicleId(v: { powertrain: string; segment: string; make: string; model: string; derivative: string; fuel: string }): string {
  const key = [v.powertrain, v.segment, v.make, v.model, v.derivative, v.fuel].map((x) => x.trim().replace(/\s+/g, " ").toLowerCase()).join("|");
  return createHash("sha1").update(key).digest("hex").slice(0, 16);
}
