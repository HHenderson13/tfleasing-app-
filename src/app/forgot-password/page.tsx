import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ForgotPasswordForm } from "./form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  // Signed-in users don't need this page — bounce them home so the form
  // can't accidentally trigger a reset email while they're already logged in.
  const me = await getCurrentUser();
  if (me) redirect("/");
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-7 sm:p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07)]">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-slate-900">Forgot password</h1>
        <p className="mt-1.5 text-[15px] leading-6 text-slate-600">
          Enter the email address on your TrustFord Leasing account. If we recognise it,
          we&apos;ll send you a link to set a new password.
        </p>
        <ForgotPasswordForm />
        <p className="mt-4 text-center text-xs text-slate-600">
          <Link href="/login" className="text-slate-700 underline-offset-2 hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
