import { redirect } from "next/navigation";
import { getCurrentBrokerUser } from "@/lib/broker-auth";
import { BrokerLoginForm } from "./form";

export const dynamic = "force-dynamic";

export default async function BrokerLoginPage() {
  const me = await getCurrentBrokerUser();
  if (me) redirect("/broker");
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Broker portal</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to access quoting and saved deals.</p>
        <BrokerLoginForm />
        <p className="mt-4 text-[11px] text-slate-400">
          Looking for the TrustFord Leasing app? <a href="/login" className="text-slate-600 underline">Sign in here</a>.
        </p>
      </div>
    </div>
  );
}
