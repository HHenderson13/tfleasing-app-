"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrokerAction, deleteBrokerAction, setBrokerActiveAction } from "./actions";

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

// Deleting a broker takes its users and their sessions with it, so the
// admin types the name to confirm. The server checks the typed name too —
// see deleteBrokerAction — which keeps the confirmation part of the
// operation rather than something the UI could be talked out of.
//
// Disable is the reversible neighbour of this button and locks everyone out
// just as well; this is for brokers we are finished with.
export function DeleteBrokerButton({ id, name, userCount }: { id: string; name: string; userCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirm() {
    setError(null);
    start(async () => {
      const res = await deleteBrokerAction({ id, confirmName: typed });
      if (!res.ok) { setError(res.error); return; }
      setOpen(false);
      setTyped("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button onClick={() => { setOpen(true); setTyped(""); setError(null); }} className="text-xs font-medium text-red-600 hover:text-red-800">
        Delete
      </button>
    );
  }
  return (
    <div className="inline-flex flex-col items-end gap-1 text-left">
      <p className="text-[11px] text-red-700">
        Deletes {name}
        {userCount > 0 && <> and {userCount} {userCount === 1 ? "user" : "users"}</>}. Type the name to confirm.
      </p>
      <div className="flex items-center gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={name}
          autoFocus
          className="rounded-lg border border-red-300 bg-white px-2 py-1 text-xs"
        />
        <button onClick={confirm} disabled={pending || !typed.trim()} className="rounded-lg bg-red-700 px-2 py-1 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50">
          {pending ? "Deleting…" : "Delete"}
        </button>
        <button onClick={() => setOpen(false)} disabled={pending} className="text-xs text-slate-600 hover:text-slate-900">Cancel</button>
      </div>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
