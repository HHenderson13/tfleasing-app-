// Pure rollup helpers used by both server and client. Kept separate from
// src/lib/forecast.ts so the client bundle doesn't pull in the DB layer.

import type { DealbookSummable } from "./line-definitions";

export interface DealbookRollup extends DealbookSummable {}

export function rollupDealbookLines(
  lines: Array<{ kind: string } & Partial<DealbookSummable>>,
  filter: "car" | "cv" | "all",
): DealbookRollup {
  const r: DealbookRollup = {
    units: 0, chassisProfit: 0, addBonus: 0, metalSubsidy: 0, reconCost: 0,
    oallowDiscount: 0, accessoryProfit: 0, warrantyCost: 0, totalVehicleProfit: 0,
    financeIncome: 0, financeMb: 0, tyreInsIncome: 0, financeSubsidy: 0,
    cpiIncome: 0, smartRepair: 0, gapRtiIncome: 0, paintProtection: 0,
    warranty: 0, totalFiIncome: 0, totalGrossProfit: 0,
  };
  for (const line of lines) {
    const isVan = line.kind === "van";
    const isCar = line.kind === "car";
    if (filter === "car" && !isCar) continue;
    if (filter === "cv" && !isVan) continue;
    r.units += 1;
    r.chassisProfit += line.chassisProfit ?? 0;
    r.addBonus += line.addBonus ?? 0;
    r.metalSubsidy += line.metalSubsidy ?? 0;
    r.reconCost += line.reconCost ?? 0;
    r.oallowDiscount += line.oallowDiscount ?? 0;
    r.accessoryProfit += line.accessoryProfit ?? 0;
    r.warrantyCost += line.warrantyCost ?? 0;
    r.totalVehicleProfit += line.totalVehicleProfit ?? 0;
    r.financeIncome += line.financeIncome ?? 0;
    r.financeMb += line.financeMb ?? 0;
    r.tyreInsIncome += line.tyreInsIncome ?? 0;
    r.financeSubsidy += line.financeSubsidy ?? 0;
    r.cpiIncome += line.cpiIncome ?? 0;
    r.smartRepair += line.smartRepair ?? 0;
    r.gapRtiIncome += line.gapRtiIncome ?? 0;
    r.paintProtection += line.paintProtection ?? 0;
    r.warranty += line.warranty ?? 0;
    r.totalFiIncome += line.totalFiIncome ?? 0;
    r.totalGrossProfit += line.totalGrossProfit ?? 0;
  }
  return r;
}
