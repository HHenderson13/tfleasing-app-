"use client";
import { useActionState, useState } from "react";
import { createUserAction } from "./actions";

const inp = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Everything",
  exec: "Proposals + orders (own first)",
  quote: "Quote section",
  stock: "Stock section",
};

export function NewUserForm({ execs }: { execs: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createUserAction, null as { error?: string; ok?: true; setupToken?: string } | null);

  if (state?.ok && state.setupToken) {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/setup/${state.setupToken}`;
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
        <div className="text-sm font-semibold text-emerald-800">User created — share this setup link</div>
        <p className="mt-1 text-xs text-emerald-700">
          The user opens this link to choose their password. Link expires in 7 days.
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-white p-2 ring-1 ring-emerald-200">
          <code className="flex-1 truncate text-xs text-slate-700">{url}</code>
          <CopyBtn text={url} />
        </div>
        <button
          onClick={() => location.reload()}
          className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
        >
          Add another
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
      <label className="block text-xs font-medium text-slate-700">
        Name
        <input className={inp} name="name" required />
      </label>
      <label className="block text-xs font-medium text-slate-700">
        Email
        <input className={inp} type="email" name="email" autoComplete="off" required />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="text-xs font-medium text-slate-700">Roles</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(["admin", "exec", "quote", "stock"] as const).map((r) => (
            <label key={r} className="flex items-start gap-2 rounded-md border border-slate-200 p-2 text-xs">
              <input type="checkbox" name={`role_${r}`} className="mt-0.5" />
              <span>
                <span className="font-medium text-slate-800 capitalize">{r}</span>
                <span className="block text-[11px] text-slate-500">{ROLE_DESCRIPTIONS[r]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-xs font-medium text-slate-700 sm:col-span-2">
        Sales exec link (optional — for exec users)
        <select name="salesExecId" className={inp} defaultValue="">
          <option value="">— None —</option>
          <option value="__new__">+ Create new sales exec from this user&apos;s name &amp; email</option>
          {execs.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        <span className="mt-1 block text-[11px] text-slate-500">
          Pick &ldquo;Create new&rdquo; if there&apos;s no sales exec record yet for this person.
        </span>
      </label>
      {state?.error && (
        <div className="sm:col-span-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{state.error}</div>
      )}
      <div className="sm:col-span-2">
        <p className="mb-2 text-[11px] text-slate-500">
          The user will set their own password via a one-time setup link. No password is needed here.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create user"}
        </button>
      </div>
    </form>
  );
}

export function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="shrink-0 rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
