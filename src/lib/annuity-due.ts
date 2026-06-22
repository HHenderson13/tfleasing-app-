// Annuity-due interest math — mirrors Excel's CUMIPMT(rate, nper, pv,
// 1, nper, 1) semantics so the Quote → Reverse Commission and Forward
// Rental calculators line up with the Options Calculator.xlsx the
// broker team uses externally.
//
// Excel formula in that sheet:
//   rental = ((CUMIPMT(r/12, n, pv, 1, n, 1) × -1) + pv) / (upfront + n)
//
// Which simplifies to:
//   rental = (PMT_due × n) / (upfront + n)
//
// because total interest = PMT_due × n − pv, so (interest + pv) =
// PMT_due × n.

// Annuity-due monthly payment for a loan amortised over n periods at
// monthlyRate, with the first payment due at t=0 (type=1 in Excel).
export function annuityDuePmt(pv: number, n: number, monthlyRate: number): number {
  if (n <= 0) return 0;
  if (monthlyRate === 0) return pv / n;
  // PMT_due = pv × r / ((1 − (1+r)^-n) × (1+r))
  const denom = (1 - Math.pow(1 + monthlyRate, -n)) * (1 + monthlyRate);
  if (denom === 0) return 0;
  return (pv * monthlyRate) / denom;
}

// Forward: given a principal (broker commission + options), term, rate
// and upfront, compute the monthly rental uplift. Matches the
// Options Calculator.xlsx F3 formula exactly.
export function rentalFromPv(input: {
  pv: number;
  term: number;
  upfront: number;
  annualRatePct: number;
}): { rental: number; totalPaid: number; interest: number } {
  const { pv, term, upfront, annualRatePct } = input;
  const totalPeriods = upfront + term;
  if (totalPeriods <= 0 || term <= 0) {
    return { rental: 0, totalPaid: 0, interest: 0 };
  }
  if (pv === 0) {
    return { rental: 0, totalPaid: 0, interest: 0 };
  }
  const monthlyRate = annualRatePct / 100 / 12;
  const pmt = annuityDuePmt(pv, term, monthlyRate);
  const totalPaid = pmt * term;
  const interest = totalPaid - pv;
  const rental = totalPaid / totalPeriods;
  return { rental, totalPaid, interest };
}

// Reverse: given the monthly rental uplift (broker − TF), term, rate
// and upfront, back out the present-value commission. This is the
// inverse of rentalFromPv — the customer pays `rental` per month for
// (upfront + term) months, which is equivalent to amortising a loan
// of `pv` over `term` annuity-due payments at the same rate.
export function pvFromRental(input: {
  rental: number;
  term: number;
  upfront: number;
  annualRatePct: number;
}): { pv: number; totalPaid: number; interest: number } {
  const { rental, term, upfront, annualRatePct } = input;
  const totalPeriods = upfront + term;
  if (totalPeriods <= 0 || term <= 0) {
    return { pv: 0, totalPaid: 0, interest: 0 };
  }
  const totalPaid = rental * totalPeriods;
  if (totalPaid === 0) {
    return { pv: 0, totalPaid: 0, interest: 0 };
  }
  // Negative gross uplift (broker rental < TF rental) doesn't need any
  // present-value adjustment — there's no positive balance to charge
  // a finance cost against. Return the gross as-is.
  if (totalPaid < 0) {
    return { pv: totalPaid, totalPaid, interest: 0 };
  }
  const monthlyRate = annualRatePct / 100 / 12;
  // PMT_due × annuity-due PV factor = pv.
  // PV factor = ((1 − (1+r)^-n) / r) × (1+r), or n when r = 0.
  const pmt = totalPaid / term;
  let pv: number;
  if (monthlyRate === 0) {
    pv = pmt * term;
  } else {
    const factor = ((1 - Math.pow(1 + monthlyRate, -term)) / monthlyRate) * (1 + monthlyRate);
    pv = pmt * factor;
  }
  const interest = totalPaid - pv;
  return { pv, totalPaid, interest };
}
