import { isUserPaid, PAYMENT_BANK, PAYMENT_DEADLINE } from "@/lib/world-cup-data";
import { ENTRY_FEE_GBP, fmtGbp } from "@/lib/world-cup-prize";

// Renders an unmissable yellow banner if the current user hasn't been marked
// paid by an admin. Returns null otherwise — paid players see a clean page.
// Server component, takes the userId so it can be dropped onto any page.
export async function PaymentBanner({ userId }: { userId: string }) {
  const paid = await isUserPaid(userId);
  if (paid) return null;

  const deadlineLabel = PAYMENT_DEADLINE.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/London",
  });

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border-2 border-amber-300 bg-amber-50 shadow-sm">
      <div className="px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">Action required</div>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-amber-950 sm:text-2xl">
              Pay your {fmtGbp(ENTRY_FEE_GBP)} entry by {deadlineLabel}
            </h2>
          </div>
        </div>
        <p className="mt-2 text-sm text-amber-900">
          You'll be removed from the game if your entry hasn't been received by then.
          Bank transfer the amount and let an admin know so they can mark you off.
        </p>
        <div className="mt-3 grid gap-2 rounded-xl border border-amber-200 bg-white p-3 text-sm sm:grid-cols-3">
          <BankDetail label="Payee" value={PAYMENT_BANK.payee} />
          <BankDetail label="Sort code" value={PAYMENT_BANK.sortCode} mono />
          <BankDetail label="Account number" value={PAYMENT_BANK.accountNumber} mono />
        </div>
      </div>
    </section>
  );
}

function BankDetail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">{label}</div>
      <div className={`mt-0.5 text-base font-semibold text-slate-900 ${mono ? "font-mono tabular-nums" : ""}`}>{value}</div>
    </div>
  );
}
