"use client";
import { useActionState } from "react";
import { forgotPasswordAction } from "./actions";

const inp = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    forgotPasswordAction,
    null as { sent?: boolean; error?: string } | null,
  );

  if (state?.sent) {
    return (
      <div className="mt-5 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
        <div className="font-semibold">Check your inbox.</div>
        <p className="mt-1 text-xs text-emerald-700">
          If that email is on a TrustFord Leasing account, a reset link is on its way.
          The link expires in 1 hour. Make sure to check your spam folder if you don&apos;t see it.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-5 space-y-3">
      <label className="block text-xs font-medium text-slate-700">
        Email
        <input
          className={inp}
          type="email"
          name="email"
          autoComplete="email"
          autoFocus
          required
        />
      </label>
      {state?.error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
          {state.error}
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
