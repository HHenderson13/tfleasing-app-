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
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Forgot password</h1>
        <p className="mt-1 text-sm text-slate-500">
          Enter the email address on your TrustFord Leasing account. If we recognise it,
          we&apos;ll send you a link to set a new password.
        </p>
        <ForgotPasswordForm />
        <p className="mt-4 text-center text-xs text-slate-500">
          <Link href="/login" className="text-slate-700 underline-offset-2 hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
