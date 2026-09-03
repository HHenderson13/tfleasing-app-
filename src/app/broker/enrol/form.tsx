"use client";
import { useActionState } from "react";
import { enrolBrokerTotpAction } from "./actions";

export function EnrolForm({ secret, formatted }: { secret: string; formatted: string }) {
  const [state, action, pending] = useActionState(enrolBrokerTotpAction, null as { error?: string } | null);
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="secret" value={secret} />
      <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-medium text-slate-700">Can&apos;t scan the code?</summary>
        <p className="mt-2 text-xs text-slate-600">
          In your authenticator app choose &ldquo;enter a setup key&rdquo; and type this:
        </p>
        <code className="mt-2 block break-all rounded-lg bg-white px-2 py-1.5 text-center font-mono text-sm tracking-wider text-slate-900 ring-1 ring-slate-200">
          {formatted}
        </code>
      </details>

      <label htmlFor="code" className="mt-4 block text-xs font-medium text-slate-700">
        Enter the 6-digit code the app shows
      </label>
      <input
        id="code"
        name="code"
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
        {pending ? "Checking…" : "Confirm and finish"}
      </button>
    </form>
  );
}
