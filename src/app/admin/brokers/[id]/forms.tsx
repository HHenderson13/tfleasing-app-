"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createBrokerUserAction,
  resetBrokerUserSetupTokenAction,
  setBrokerUserActiveAction,
  setBrokerUserRoleAction,
} from "../actions";

const inp = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm";

function SetupLinkBanner({ path, expiresAt, onDismiss }: { path: string; expiresAt: string; onDismiss: () => void }) {
  const url = typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  }
  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs">
      <div className="font-semibold text-emerald-900">Setup link ready</div>
      <div className="mt-1 text-emerald-900/80">Share this link — it expires {new Date(expiresAt).toLocaleString("en-GB")}.</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="rounded bg-white px-2 py-1 text-[11px] text-slate-800 ring-1 ring-emerald-200">{url}</code>
        <button onClick={copy} className="rounded-lg bg-emerald-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-800">
          {copied ? "Copied" : "Copy"}
        </button>
        <button onClick={onDismiss} className="text-emerald-800 hover:underline">Dismiss</button>
      </div>
    </div>
  );
}

export function AddBrokerUserForm({ brokerId }: { brokerId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "user">("user");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ path: string; expiresAt: string } | null>(null);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createBrokerUserAction({ brokerId, name: name.trim(), email: email.trim(), role });
      if (!res.ok) { setError(res.error); return; }
      setLink({ path: res.setupPath, expiresAt: res.expiresAt });
      setName(""); setEmail(""); setRole("user");
      router.refresh();
    });
  }
  return (
    <div>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs font-medium text-slate-700">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} className={inp} required />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-700">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inp} required />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-700">
          Role
          <select value={role} onChange={(e) => setRole(e.target.value === "owner" ? "owner" : "user")} className={inp}>
            <option value="user">User</option>
            <option value="owner">Owner — can manage other users at this broker</option>
          </select>
        </label>
        <button type="submit" disabled={pending || !name.trim() || !email.trim()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Creating…" : "Create user"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </form>
      {link && <SetupLinkBanner path={link.path} expiresAt={link.expiresAt} onDismiss={() => setLink(null)} />}
    </div>
  );
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "owner" | "user";
  active: boolean;
  hasSetupToken: boolean;
  createdAt: string;
}

export function BrokerUsersTable({ brokerId, users }: { brokerId: string; users: UserRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ path: string; expiresAt: string } | null>(null);

  function toggleActive(u: UserRow) {
    start(async () => {
      const res = await setBrokerUserActiveAction({ brokerId, userId: u.id, active: !u.active });
      if (res.ok) router.refresh();
    });
  }
  function toggleRole(u: UserRow) {
    start(async () => {
      const res = await setBrokerUserRoleAction({ brokerId, userId: u.id, role: u.role === "owner" ? "user" : "owner" });
      if (res.ok) router.refresh();
    });
  }
  function regenerate(u: UserRow) {
    start(async () => {
      const res = await resetBrokerUserSetupTokenAction({ brokerId, userId: u.id });
      if (res.ok) {
        setLink({ path: res.setupPath, expiresAt: res.expiresAt });
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">User</th>
              <th className="px-4 py-3 text-left font-medium">Role</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Setup</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{u.name}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleRole(u)}
                    disabled={pending}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
                      u.role === "owner" ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-slate-50 text-slate-700 ring-slate-200"
                    }`}
                    title={u.role === "owner" ? "Click to demote to user" : "Click to promote to owner"}
                  >
                    {u.role === "owner" ? "Owner" : "User"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  {u.active ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">Active</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">Disabled</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-[11px] text-slate-500">
                  {u.hasSetupToken ? "Pending password" : "Activated"}
                </td>
                <td className="px-4 py-3 text-right space-x-3 whitespace-nowrap">
                  <button onClick={() => regenerate(u)} disabled={pending} className="text-xs text-slate-600 hover:text-slate-900 disabled:opacity-50">New setup link</button>
                  <button onClick={() => toggleActive(u)} disabled={pending} className="text-xs text-slate-600 hover:text-slate-900 disabled:opacity-50">
                    {u.active ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">No users yet — add one above.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {link && (
        <div className="mt-3">
          <SetupLinkBanner path={link.path} expiresAt={link.expiresAt} onDismiss={() => setLink(null)} />
        </div>
      )}
    </div>
  );
}
