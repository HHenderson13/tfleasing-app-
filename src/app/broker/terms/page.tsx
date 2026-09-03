import { brokerSignOutAction } from "../login/actions";
import { requireBrokerUser } from "@/lib/auth-guard";
import { BROKER_TERMS, BROKER_TERMS_VERSION, hasAcceptedCurrentTerms } from "@/lib/broker-terms";
import { acceptBrokerTermsAction } from "./actions";

export const dynamic = "force-dynamic";

// The gate every broker passes once per terms version. Deliberately NOT
// wrapped in WatermarkFrame: there is no stock on this page to protect, and
// a watermark over the rules would be theatre.
//
// Guarded with requireBrokerUser rather than requireBrokerTermsAccepted —
// gating this page on acceptance would redirect it to itself forever.
export default async function BrokerTermsPage() {
  const me = await requireBrokerUser();
  const already = await hasAcceptedCurrentTerms(me.id);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3 text-sm">
          <span className="font-semibold text-slate-900">{me.brokerName}</span>
          <form action={brokerSignOutAction}>
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-1 font-medium text-slate-700 hover:bg-slate-100">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-slate-900">Stock access terms</h1>
        <p className="mt-2 text-sm text-slate-600">
          Before you can see the stock list, please read and accept these terms. They apply to you personally,
          as <strong>{me.name}</strong> ({me.email}) at <strong>{me.brokerName}</strong>.
        </p>

        <ol className="mt-8 space-y-5">
          {BROKER_TERMS.map((t, i) => (
            <li key={t.heading} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                  {i + 1}
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{t.heading}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{t.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {already ? (
            <p className="text-sm text-slate-600">
              You have already accepted these terms.{" "}
              <a href="/broker/stock" className="font-medium text-slate-900 underline">Go to stock</a>.
            </p>
          ) : (
            <form action={acceptBrokerTermsAction}>
              <p className="text-sm text-slate-700">
                By continuing you confirm you have read these terms and agree to them. Your acceptance is recorded
                against your account with the date, time and device you accepted from.
              </p>
              <button
                type="submit"
                className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 sm:w-auto sm:px-6"
              >
                I have read and accept these terms
              </button>
            </form>
          )}
          <p className="mt-4 text-[11px] text-slate-400">Version {BROKER_TERMS_VERSION}</p>
        </div>
      </main>
    </div>
  );
}
