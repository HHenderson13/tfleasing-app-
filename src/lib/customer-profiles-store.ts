import "server-only";

// Customer Profiles: storage. Each profile belongs to the exec who made it;
// admins can see and work on everyone's. Answers live in one JSON column and
// are merged with json_patch, so two quick saves can't undo each other.
//
// Part exchange appraisals are stored here too, in 2MB pieces: a Vercel
// function takes at most 4.5MB in a request, and an appraisal with photos can
// be bigger than that. Kept in our own database rather than a public blob
// store because it carries a customer's registration and valuation.

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { isAdmin, type CurrentUser } from "./auth";
import type { ProfileData, ProfileKind, ProfileStatus } from "./customer-profiles";

export interface ProfileRow {
  id: string;
  ownerId: string;
  ownerName: string;
  customerName: string;
  kind: ProfileKind;
  model: string;
  status: ProfileStatus;
  lostReason: string | null;
  lostNote: string | null;
  data: ProfileData;
  /** The answers as they were the last time everything was copied for the CRM. */
  copied: ProfileData | null;
  copiedAt: number | null;
  /** Epoch seconds. */
  createdAt: number;
  updatedAt: number;
  closedAt: number | null;
}

export interface ProfileDoc {
  id: string;
  kind: "fuel" | "ranger" | "appraisal";
  createdAt: number;
  title: string;
  detail: string | null;
  href: string;
  filename: string;
}

/** What the profile page holds; also its first render. */
export interface ProfileSnapshot {
  id: string; ownerId: string; ownerName: string; customerName: string; kind: ProfileKind; model: string; status: ProfileStatus;
  lostReason: string | null; lostNote: string | null; closedAt: number | null; createdAt: number; updatedAt: number;
  data: ProfileData; copied: { data: ProfileData; at: number } | null; docs: ProfileDoc[];
}

export function snapshotOf(p: ProfileRow, docs: ProfileDoc[]): ProfileSnapshot {
  return {
    id: p.id, ownerId: p.ownerId, ownerName: p.ownerName, customerName: p.customerName, kind: p.kind, model: p.model, status: p.status,
    lostReason: p.lostReason, lostNote: p.lostNote, closedAt: p.closedAt, createdAt: p.createdAt, updatedAt: p.updatedAt, data: p.data,
    copied: p.copied && p.copiedAt != null ? { data: p.copied, at: p.copiedAt } : null, docs,
  };
}

type Raw = {
  id: string; owner_id: string; owner_name: string; customer_name: string; kind: string; model: string; status: string;
  lost_reason: string | null; lost_note: string | null; data: string; copied: string | null; copied_at: number | null;
  created_at: number; updated_at: number; closed_at: number | null;
};

const parse = (s: string | null): ProfileData | null => {
  if (!s) return null;
  try { const v = JSON.parse(s); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; }
};

const fromRaw = (r: Raw): ProfileRow => ({
  id: r.id, ownerId: r.owner_id, ownerName: r.owner_name, customerName: r.customer_name, kind: r.kind as ProfileKind, model: r.model,
  status: r.status as ProfileStatus, lostReason: r.lost_reason, lostNote: r.lost_note, data: parse(r.data) ?? {}, copied: parse(r.copied),
  copiedAt: r.copied_at == null ? null : Number(r.copied_at), createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  closedAt: r.closed_at == null ? null : Number(r.closed_at),
});

const nowSec = () => Math.floor(Date.now() / 1000);
const COLS = sql`id, owner_id, owner_name, customer_name, kind, model, status, lost_reason, lost_note, data, copied, copied_at, created_at, updated_at, closed_at`;

/**
 * Anyone signed in can open anyone's profiles (user, 2026-11-04: an exec
 * starts on their own but can flick into a colleague's). Changing one is for
 * the exec it belongs to, or an admin.
 */
export const canWork = (user: CurrentUser, ownerId: string) => ownerId === user.id || isAdmin(user);

export async function createProfile(user: CurrentUser, p: { customerName: string; kind: ProfileKind; model: string; data?: ProfileData }): Promise<string> {
  const id = randomUUID();
  const t = nowSec();
  await db.run(sql`
    INSERT INTO customer_profiles (id, owner_id, owner_name, customer_name, kind, model, status, data, created_at, updated_at)
    VALUES (${id}, ${user.id}, ${user.name || user.email}, ${p.customerName}, ${p.kind}, ${p.model}, 'live', ${JSON.stringify(p.data ?? {})}, ${t}, ${t})
  `);
  return id;
}

export async function getProfile(id: string): Promise<ProfileRow | null> {
  const [r] = await db.all<Raw>(sql`SELECT ${COLS} FROM customer_profiles WHERE id = ${id}`);
  return r ? fromRaw(r) : null;
}

/** Whose profiles to list: one exec's (by user id), or everyone's. */
export type ProfileView = { owner: string } | "all";

/** Every live profile in the view, and the latest 500 closed ones. */
export async function listProfiles(view: ProfileView): Promise<ProfileRow[]> {
  const mine = view === "all" ? sql`1 = 1` : sql`owner_id = ${view.owner}`;
  const [live, closed] = await Promise.all([
    db.all<Raw>(sql`SELECT ${COLS} FROM customer_profiles WHERE ${mine} AND status = 'live'`),
    db.all<Raw>(sql`SELECT ${COLS} FROM customer_profiles WHERE ${mine} AND status != 'live' ORDER BY closed_at DESC LIMIT 500`),
  ]);
  return [...live, ...closed].map(fromRaw);
}

/** Everyone with a profile, for the "whose" picker. */
export async function listOwners(): Promise<{ id: string; name: string; live: number }[]> {
  const rows = await db.all<{ owner_id: string; owner_name: string; live: number }>(sql`
    SELECT owner_id, max(owner_name) AS owner_name, sum(status = 'live') AS live FROM customer_profiles GROUP BY owner_id ORDER BY owner_name`);
  return rows.map((r) => ({ id: r.owner_id, name: r.owner_name, live: Number(r.live) }));
}

/** Merge answers in. A null removes the answer. */
export async function patchProfileData(id: string, patch: Record<string, unknown>): Promise<void> {
  await db.run(sql`UPDATE customer_profiles SET data = json_patch(data, ${JSON.stringify(patch)}), updated_at = ${nowSec()} WHERE id = ${id}`);
}

export async function updateProfileHeader(id: string, p: { customerName?: string; kind?: ProfileKind; model?: string }): Promise<void> {
  const sets = [
    p.customerName != null ? sql`customer_name = ${p.customerName}` : null,
    p.kind != null ? sql`kind = ${p.kind}` : null,
    p.model != null ? sql`model = ${p.model}` : null,
  ].filter((x): x is NonNullable<typeof x> => x != null);
  if (!sets.length) return;
  await db.run(sql`UPDATE customer_profiles SET ${sql.join(sets, sql`, `)}, updated_at = ${nowSec()} WHERE id = ${id}`);
}

export async function setProfileStatus(id: string, status: ProfileStatus, reason: string | null, note: string | null): Promise<void> {
  const t = nowSec();
  await db.run(sql`
    UPDATE customer_profiles SET status = ${status}, lost_reason = ${status === "lost" ? reason : null}, lost_note = ${status === "lost" ? note : null},
      closed_at = ${status === "live" ? null : t}, updated_at = ${t}
    WHERE id = ${id}
  `);
}

/** Everything as it stands is now in the CRM: the next "copy what's new" starts from here. */
export async function markCopied(id: string): Promise<number> {
  const t = nowSec();
  await db.run(sql`UPDATE customer_profiles SET copied = data, copied_at = ${t} WHERE id = ${id}`);
  return t;
}

export async function deleteProfile(id: string): Promise<void> {
  await db.run(sql`DELETE FROM customer_profile_file_chunks WHERE file_id IN (SELECT id FROM customer_profile_files WHERE profile_id = ${id})`);
  await db.run(sql`DELETE FROM customer_profile_files WHERE profile_id = ${id}`);
  // The PDFs themselves stay in Saved comparisons; they just stop pointing here.
  await db.run(sql`UPDATE fuel_exports SET profile_id = NULL WHERE profile_id = ${id}`);
  await db.run(sql`UPDATE ranger_exports SET profile_id = NULL WHERE profile_id = ${id}`);
  await db.run(sql`DELETE FROM customer_profiles WHERE id = ${id}`);
}

// ─── Documents: the calculators' PDFs and the appraisals ─────────────────

const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

export async function listProfileDocs(profileIds: string[]): Promise<Map<string, ProfileDoc[]>> {
  const out = new Map<string, ProfileDoc[]>();
  if (!profileIds.length) return out;
  const ids = sql.join(profileIds.map((id) => sql`${id}`), sql`, `);
  const [fuel, ranger, files] = await Promise.all([
    db.all<{ id: string; profile_id: string; created_at: number; ice_name: string | null; ev_name: string | null; saving_monthly: number | null; filename: string }>(sql`
      SELECT id, profile_id, created_at, ice_name, ev_name, saving_monthly, filename FROM fuel_exports WHERE profile_id IN (${ids})`),
    db.all<{ id: string; profile_id: string; created_at: number; vehicles: string; best_name: string | null; saving_annual: number | null; saving_monthly: number | null; filename: string }>(sql`
      SELECT id, profile_id, created_at, vehicles, best_name, saving_annual, saving_monthly, filename FROM ranger_exports WHERE profile_id IN (${ids})`),
    db.all<{ id: string; profile_id: string; created_at: number; filename: string; size: number }>(sql`
      SELECT id, profile_id, created_at, filename, size FROM customer_profile_files WHERE profile_id IN (${ids}) AND complete = 1`),
  ]);
  const add = (pid: string, d: ProfileDoc) => { const l = out.get(pid) ?? []; l.push(d); out.set(pid, l); };
  for (const r of fuel) {
    const s = r.saving_monthly == null ? null : Number(r.saving_monthly);
    add(r.profile_id, {
      id: r.id, kind: "fuel", createdAt: Number(r.created_at), filename: r.filename, href: `/fuel-calculator/exports/${r.id}`,
      title: "Fuel cost comparison",
      detail: [r.ev_name && r.ice_name ? `${r.ev_name.split(",")[0]} against ${r.ice_name.split(",")[0]}` : null,
        s != null && s > 0 ? `saves ${gbp(s)} a month` : s != null && s < 0 ? `costs ${gbp(-s)} a month more` : null].filter(Boolean).join(", ") || null,
    });
  }
  for (const r of ranger) {
    const a = r.saving_annual == null ? null : Number(r.saving_annual);
    const m = r.saving_monthly == null ? null : Number(r.saving_monthly);
    add(r.profile_id, {
      id: r.id, kind: "ranger", createdAt: Number(r.created_at), filename: r.filename, href: `/ranger-bik/exports/${r.id}`,
      title: "Ranger tax comparison",
      detail: r.best_name && a != null && a > 0 ? `${r.best_name} saves ${gbp(a)} a year${m != null ? `, ${gbp(m)} a month` : ""}` : r.vehicles.split(", ").join(" against "),
    });
  }
  for (const r of files) {
    add(r.profile_id, {
      id: r.id, kind: "appraisal", createdAt: Number(r.created_at), filename: r.filename, href: `/profiles/${r.profile_id}/files/${r.id}`,
      title: "Part exchange appraisal", detail: `${r.filename}, ${fmtSize(Number(r.size))}`,
    });
  }
  for (const l of out.values()) l.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

export const fmtSize = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1000))}KB`);

// ─── Appraisal PDFs, in pieces ───────────────────────────────────────────

/** Well inside Vercel's 4.5MB request limit and small enough for one database write. */
export const CHUNK_BYTES = 2 * 1024 * 1024;
export const MAX_FILE_BYTES = 30 * 1024 * 1024;

export async function startFile(profileId: string, filename: string, size: number, by: string): Promise<{ id: string; chunks: number }> {
  // Anything left half uploaded more than an hour ago never finished: clear it.
  const stale = nowSec() - 3600;
  await db.run(sql`DELETE FROM customer_profile_file_chunks WHERE file_id IN (SELECT id FROM customer_profile_files WHERE complete = 0 AND created_at < ${stale})`);
  await db.run(sql`DELETE FROM customer_profile_files WHERE complete = 0 AND created_at < ${stale}`);
  const id = randomUUID();
  const chunks = Math.max(1, Math.ceil(size / CHUNK_BYTES));
  await db.run(sql`
    INSERT INTO customer_profile_files (id, profile_id, kind, filename, size, chunks, complete, uploaded_by, created_at)
    VALUES (${id}, ${profileId}, 'appraisal', ${filename}, ${size}, ${chunks}, 0, ${by}, ${nowSec()})
  `);
  return { id, chunks };
}

export async function getFile(id: string): Promise<{ id: string; profileId: string; filename: string; size: number; chunks: number; complete: boolean } | null> {
  const [r] = await db.all<{ id: string; profile_id: string; filename: string; size: number; chunks: number; complete: number }>(sql`
    SELECT id, profile_id, filename, size, chunks, complete FROM customer_profile_files WHERE id = ${id}`);
  return r ? { id: r.id, profileId: r.profile_id, filename: r.filename, size: Number(r.size), chunks: Number(r.chunks), complete: !!Number(r.complete) } : null;
}

export async function putChunk(fileId: string, seq: number, bytes: Uint8Array): Promise<void> {
  await db.run(sql`INSERT OR REPLACE INTO customer_profile_file_chunks (file_id, seq, data) VALUES (${fileId}, ${seq}, ${bytes})`);
}

/** Checks every piece arrived, the sizes add up and it really is a PDF, then makes it visible. */
export async function finishFile(fileId: string): Promise<{ ok: boolean; error?: string }> {
  const f = await getFile(fileId);
  if (!f) return { ok: false, error: "Upload not found." };
  const rows = await db.all<{ seq: number; n: number }>(sql`SELECT seq, length(data) AS n FROM customer_profile_file_chunks WHERE file_id = ${fileId} ORDER BY seq`);
  const total = rows.reduce((s, r) => s + Number(r.n), 0);
  const complete = rows.length === f.chunks && rows.every((r, i) => Number(r.seq) === i) && total === f.size;
  const [head] = await db.all<{ h: string }>(sql`SELECT hex(substr(data, 1, 5)) AS h FROM customer_profile_file_chunks WHERE file_id = ${fileId} AND seq = 0`);
  const isPdf = head?.h === "255044462D"; // "%PDF-"
  if (!complete || !isPdf) {
    await db.run(sql`DELETE FROM customer_profile_file_chunks WHERE file_id = ${fileId}`);
    await db.run(sql`DELETE FROM customer_profile_files WHERE id = ${fileId}`);
    return { ok: false, error: !isPdf ? "That file isn't a PDF." : "Part of the file didn't arrive. Please try again." };
  }
  await db.run(sql`UPDATE customer_profile_files SET complete = 1 WHERE id = ${fileId}`);
  return { ok: true };
}

export async function readChunk(fileId: string, seq: number): Promise<Uint8Array | null> {
  const [r] = await db.all<{ data: ArrayBuffer | Uint8Array }>(sql`SELECT data FROM customer_profile_file_chunks WHERE file_id = ${fileId} AND seq = ${seq}`);
  if (!r) return null;
  return r.data instanceof Uint8Array ? r.data : new Uint8Array(r.data);
}

export async function deleteFile(fileId: string): Promise<void> {
  await db.run(sql`DELETE FROM customer_profile_file_chunks WHERE file_id = ${fileId}`);
  await db.run(sql`DELETE FROM customer_profile_files WHERE id = ${fileId}`);
}
