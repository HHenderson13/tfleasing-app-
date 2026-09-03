import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BROKER_CHALLENGE_COOKIE, pendingChallengeUser } from "@/lib/broker-auth";
import { VerifyForm } from "./form";

export const dynamic = "force-dynamic";

// Step two of every sign-in. Reachable without a session by design — the
// password has been accepted but the second factor has not, so there is no
// session yet, only the challenge cookie this page validates.
export default async function BrokerVerifyPage() {
  const jar = await cookies();
  const user = await pendingChallengeUser(jar.get(BROKER_CHALLENGE_COOKIE)?.value);
  if (!user) redirect("/broker/login");
  if (!user.totpSecret) redirect("/broker/enrol");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Enter your code</h1>
        <p className="mt-1 text-sm text-slate-500">
          Open your authenticator app and enter the current 6-digit code for <strong>{user.email}</strong>.
        </p>
        <VerifyForm />
        <p className="mt-4 text-[11px] text-slate-400">
          The code changes every 30 seconds. Lost your phone? Ask your account manager to reset it.
        </p>
      </div>
    </div>
  );
}
