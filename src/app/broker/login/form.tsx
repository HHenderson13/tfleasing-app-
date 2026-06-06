"use client";
import { useActionState } from "react";
import { brokerSignInAction } from "./actions";

const inp = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

export function BrokerLoginForm() {
  const [state, action, pending] = useActionState(brokerSignInAction, null as { error?: string } | null);
  return (
    <form action={action} className="mt-5 space-y-3">
      <label className="block text-xs font-medium text-slate-700">
        Email
        <input className={inp} type="email" name="email" autoComplete="email" required />
      </label>
      <label className="block text-xs font-medium text-slate-700">
        Password
        <input className={inp} type="password" name="password" autoComplete="current-password" required />
      </label>
      {state?.error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{state.error}</div>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
