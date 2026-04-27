"use client";
import { useActionState, useState } from "react";
import { completeSetupAction } from "./actions";
import { PasswordIndicator } from "@/app/login/forms";

const inp = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

export function SetupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(completeSetupAction, null as { error?: string } | null);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && confirm !== pw;
  return (
    <form action={action} className="mt-5 space-y-3">
      <input type="hidden" name="token" value={token} />
      <label className="block text-xs font-medium text-slate-700">
        New password
        <input
          className={inp}
          type="password"
          name="password"
          autoComplete="new-password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
        />
      </label>
      <PasswordIndicator value={pw} />
      <label className="block text-xs font-medium text-slate-700">
        Confirm password
        <input
          className={inp}
          type="password"
          name="confirm"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </label>
      {mismatch && <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 ring-1 ring-amber-200">Passwords don&apos;t match yet.</div>}
      {state?.error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{state.error}</div>}
      <button
        type="submit"
        disabled={pending || mismatch}
        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Setting up…" : "Set password &amp; sign in"}
      </button>
    </form>
  );
}
