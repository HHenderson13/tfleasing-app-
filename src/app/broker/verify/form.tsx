"use client";
import { useActionState } from "react";
import { verifyBrokerCodeAction } from "./actions";

export function VerifyForm() {
  const [state, action, pending] = useActionState(verifyBrokerCodeAction, null as { error?: string } | null);
  return (
    <form action={action} className="mt-5">
      <label htmlFor="code" className="block text-xs font-medium text-slate-700">
        6-digit code
      </label>
      <input
        id="code"
        name="code"
        // A numeric keypad on a phone, and the browser's own one-time-code
        // autofill where the OS offers it.
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        required
        autoFocus
        placeholder="123456"
        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-center text-2xl font-semibold tracking-[0.4em] tabular-nums"
      />
      {state?.error && <p className="mt-2 text-xs text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Checking…" : "Verify"}
      </button>
    </form>
  );
}
