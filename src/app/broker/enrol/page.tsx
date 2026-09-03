import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { BROKER_CHALLENGE_COOKIE, pendingChallengeUser } from "@/lib/broker-auth";
import { formatSecretForDisplay, generateTotpSecret, otpauthUri } from "@/lib/totp";
import { EnrolForm } from "./form";

export const dynamic = "force-dynamic";

const ISSUER = "Stock Portal";

// First sign-in only. The secret is minted here and shown as a QR, but it is
// NOT saved until the broker types back a code from it — otherwise a
// half-finished scan would enrol a secret they cannot produce codes for and
// lock them out of an account they can no longer sign in to.
export default async function BrokerEnrolPage() {
  const jar = await cookies();
  const user = await pendingChallengeUser(jar.get(BROKER_CHALLENGE_COOKIE)?.value);
  if (!user) redirect("/broker/login");
  if (user.totpSecret) redirect("/broker/verify");

  const secret = generateTotpSecret();
  const uri = otpauthUri(secret, user.email, ISSUER);
  // Rendered to an inline data URI: the QR must not be fetched from anywhere,
  // and this page must not depend on a network round trip to be usable.
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: "M" });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Set up two-factor</h1>
        <p className="mt-1 text-sm text-slate-500">
          One-time setup for <strong>{user.email}</strong>. From now on you&apos;ll need a code from your phone
          every time you sign in.
        </p>
        <ol className="mt-4 space-y-1 text-xs text-slate-600">
          <li>1. Open Microsoft Authenticator, Google Authenticator or 1Password.</li>
          <li>2. Add an account and scan this code.</li>
        </ol>
        <div className="mt-4 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Two-factor setup QR code" width={220} height={220} className="rounded-xl ring-1 ring-slate-200" />
        </div>
        <EnrolForm secret={secret} formatted={formatSecretForDisplay(secret)} />
      </div>
    </div>
  );
}
