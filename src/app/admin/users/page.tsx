import { db } from "@/db";
import { salesExecs, users } from "@/db/schema";
import { asc } from "drizzle-orm";
import { ROLES, type Role } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth-guard";
import { deleteUserAction, regenerateInviteAction, updateUserAction } from "./actions";
import { NewUserForm } from "./forms";
import { InviteLink } from "./invite-link";

export const dynamic = "force-dynamic";

function parseRoles(json: string): Role[] {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter((r): r is Role => typeof r === "string" && (ROLES as readonly string[]).includes(r));
  } catch {
    return [];
  }
}

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const [allUsers, execs] = await Promise.all([
    db.select().from(users).orderBy(asc(users.name)),
    db.select().from(salesExecs).orderBy(asc(salesExecs.name)),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
        <p className="mt-1 text-sm text-slate-500">Create accounts, assign roles, and link to a sales exec. Users set their own password via a one-time link.</p>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Add a user</h2>
        <NewUserForm execs={execs.map((e) => ({ id: e.id, name: e.name }))} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Existing users ({allUsers.length})</h2>
        <ul className="space-y-3">
          {allUsers.map((u) => {
            const roles = parseRoles(u.roles);
            const isMe = u.id === me.id;
            const pending = !!u.setupToken;
            const expired = pending && u.setupTokenExpiresAt && u.setupTokenExpiresAt.getTime() < Date.now();
            return (
              <li key={u.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">
                      {u.name}
                      {isMe && <span className="ml-2 text-[10px] uppercase text-slate-400">(you)</span>}
                      {pending && (
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${expired ? "bg-red-50 text-red-700 ring-red-200" : "bg-amber-50 text-amber-700 ring-amber-200"}`}>
                          {expired ? "Setup expired" : "Setup pending"}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={regenerateInviteAction}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                        {pending ? "Regenerate link" : "Send setup link"}
                      </button>
                    </form>
                    {!isMe && (
                      <form action={deleteUserAction}>
                        <input type="hidden" name="id" value={u.id} />
                        <button className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100">
                          Delete
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                {pending && u.setupToken && !expired && <InviteLink token={u.setupToken} />}

                <form action={updateUserAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={u.id} />
                  <fieldset>
                    <legend className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Roles</legend>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {(["admin", "exec", "quote", "stock"] as const).map((r) => (
                        <label key={r} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs">
                          <input type="checkbox" name={`role_${r}`} defaultChecked={roles.includes(r)} />
                          <span className="capitalize">{r}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Linked sales exec
                    <select name="salesExecId" defaultValue={u.salesExecId ?? ""} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs">
                      <option value="">— None —</option>
                      <option value="__new__">+ Create new sales exec from this user</option>
                      {execs.map((e) => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="sm:col-span-2">
                    <button className="rounded-md bg-slate-800 px-3 py-1 text-xs font-medium text-white">Save changes</button>
                  </div>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
