"use client";
import { useActionState, useState } from "react";
import { bootstrapAdminAction, signInAction } from "./actions";

const inp = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

export function LoginForm() {
  const [state, action, pending] = useActionState(signInAction, null as { error?: string } | null);
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

export function BootstrapForm() {
  const [state, action, pending] = useActionState(bootstrapAdminAction, null as { error?: string } | null);
  const [pw, setPw] = useState("");
  return (
    <form action={action} className="mt-5 space-y-3">
      <label className="block text-xs font-medium text-slate-700">
        Full name
        <input className={inp} name="name" required />
      </label>
      <label className="block text-xs font-medium text-slate-700">
        Email
        <input className={inp} type="email" name="email" autoComplete="email" required />
      </label>
      <label className="block text-xs font-medium text-slate-700">
        Password
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
      {state?.error && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{state.error}</div>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create administrator"}
      </button>
    </form>
  );
}

export function PasswordIndicator({ value }: { value: string }) {
  const checks = [
    { label: "At least 12 characters", passed: value.length >= 12 },
    { label: "An uppercase letter (A–Z)", passed: /[A-Z]/.test(value) },
    { label: "A lowercase letter (a–z)", passed: /[a-z]/.test(value) },
    { label: "A number (0–9)", passed: /[0-9]/.test(value) },
    { label: "A special character (e.g. ! @ # $ %)", passed: /[^A-Za-z0-9]/.test(value) },
  ];
  return (
    <ul className="space-y-1 rounded-md bg-slate-50 p-2 text-[11px] ring-1 ring-slate-200">
      {checks.map((c) => (
        <li key={c.label} className={c.passed ? "text-emerald-700" : "text-slate-500"}>
          <span className="mr-1">{c.passed ? "✓" : "•"}</span>{c.label}
        </li>
      ))}
    </ul>
  );
}
