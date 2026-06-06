"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrokerAction, setBrokerActiveAction } from "./actions";

const inp = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm";

export function CreateBrokerForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createBrokerAction({ name: name.trim() });
      if (!res.ok) setError(res.error);
      else { setName(""); router.refresh(); }
    });
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-xs font-medium text-slate-700">
        Broker name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Acme Vehicle Leasing"
          className={inp}
          required
        />
      </label>
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add broker"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}

export function BrokerToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => {
        const res = await setBrokerActiveAction(id, !active);
        if (res.ok) router.refresh();
      })}
      disabled={pending}
      className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
    >
      {active ? "Disable" : "Enable"}
    </button>
  );
}
