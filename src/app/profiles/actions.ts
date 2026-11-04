"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-guard";
import type { CurrentUser } from "@/lib/auth";
import { KINDS, LOST_REASONS, cleanPatch, type ProfileKind, type ProfileStatus } from "@/lib/customer-profiles";
import {
  CHUNK_BYTES, MAX_FILE_BYTES, canWork, createProfile, deleteFile, deleteProfile, finishFile, getFile, getProfile, listProfileDocs, markCopied,
  patchProfileData, putChunk, setProfileStatus, snapshotOf, startFile, updateProfileHeader, type ProfileDoc, type ProfileSnapshot,
} from "@/lib/customer-profiles-store";
import { logError } from "@/lib/logger";

// Every action checks the profile belongs to the signed-in exec, or that
// they're an admin. The page hiding a button is not the control.

const UUID = /^[0-9a-f-]{36}$/;
const text = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

async function mine(id: unknown): Promise<{ user: CurrentUser; id: string } | null> {
  const user = await requireUser();
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const p = await getProfile(id);
  return p && canWork(user, p.ownerId) ? { user, id } : null;
}

export async function createProfileAction(input: { customerName: string; kind: string; model: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const user = await requireUser();
  const customerName = text(input.customerName, 120);
  if (!customerName) return { ok: false, error: "Add the customer's name." };
  if (!KINDS.includes(input.kind as ProfileKind)) return { ok: false, error: "Choose personal or business." };
  try {
    const id = await createProfile(user, { customerName, kind: input.kind as ProfileKind, model: text(input.model, 80) });
    revalidatePath("/profiles");
    return { ok: true, id };
  } catch (e) {
    logError("profiles/create", e);
    return { ok: false, error: "Couldn't create the profile. Please try again." };
  }
}

/** Autosave: a handful of answers at a time. */
export async function saveProfileDataAction(id: string, patch: Record<string, unknown>): Promise<{ ok: boolean }> {
  const m = await mine(id);
  const clean = cleanPatch(patch);
  if (!m || !clean) return { ok: false };
  try {
    await patchProfileData(m.id, clean);
    return { ok: true };
  } catch (e) {
    logError("profiles/save", e, { id });
    return { ok: false };
  }
}

export async function updateProfileHeaderAction(id: string, input: { customerName?: string; kind?: string; model?: string }): Promise<{ ok: boolean }> {
  const m = await mine(id);
  if (!m) return { ok: false };
  const customerName = input.customerName != null ? text(input.customerName, 120) : undefined;
  if (customerName === "") return { ok: false };
  if (input.kind != null && !KINDS.includes(input.kind as ProfileKind)) return { ok: false };
  await updateProfileHeader(m.id, { customerName, kind: input.kind as ProfileKind | undefined, model: input.model != null ? text(input.model, 80) : undefined });
  revalidatePath("/profiles");
  return { ok: true };
}

export async function setProfileStatusAction(id: string, status: string, reason?: string, note?: string): Promise<{ ok: boolean }> {
  const m = await mine(id);
  if (!m || !["live", "ordered", "lost"].includes(status)) return { ok: false };
  const why = status === "lost" ? (LOST_REASONS.includes(String(reason)) ? String(reason) : "Other") : null;
  await setProfileStatus(m.id, status as ProfileStatus, why, status === "lost" ? text(note, 500) || null : null);
  revalidatePath("/profiles");
  return { ok: true };
}

export async function markCopiedAction(id: string): Promise<{ ok: boolean; at?: number }> {
  const m = await mine(id);
  if (!m) return { ok: false };
  return { ok: true, at: await markCopied(m.id) };
}

export async function deleteProfileAction(id: string): Promise<{ ok: boolean }> {
  const m = await mine(id);
  if (!m) return { ok: false };
  await deleteProfile(m.id);
  revalidatePath("/profiles");
  return { ok: true };
}

// ─── Part exchange appraisal: up in pieces, then checked ─────────────────

export async function startAppraisalUploadAction(input: { profileId: string; filename: string; size: number }): Promise<{ ok: boolean; fileId?: string; chunks?: number; chunkBytes?: number; error?: string }> {
  const m = await mine(input.profileId);
  if (!m) return { ok: false, error: "You can't add files to this profile." };
  const size = Number(input.size);
  if (!Number.isInteger(size) || size <= 0) return { ok: false, error: "That file is empty." };
  if (size > MAX_FILE_BYTES) return { ok: false, error: `That file is ${(size / 1_000_000).toFixed(1)}MB. The most it can take is ${MAX_FILE_BYTES / 1024 / 1024}MB.` };
  const filename = text(input.filename, 160).replace(/[\\/:*?"<>|]/g, "") || "Appraisal.pdf";
  if (!/\.pdf$/i.test(filename)) return { ok: false, error: "Upload the appraisal as a PDF." };
  const { id, chunks } = await startFile(m.id, filename, size, m.user.name || m.user.email);
  return { ok: true, fileId: id, chunks, chunkBytes: CHUNK_BYTES };
}

export async function uploadAppraisalChunkAction(form: FormData): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const fileId = String(form.get("fileId") ?? "");
  const seq = Number(form.get("seq"));
  const chunk = form.get("chunk");
  if (!UUID.test(fileId) || !Number.isInteger(seq) || seq < 0 || !(chunk instanceof Blob) || chunk.size > CHUNK_BYTES) return { ok: false };
  const f = await getFile(fileId);
  if (!f || f.complete || seq >= f.chunks) return { ok: false };
  const p = await getProfile(f.profileId);
  if (!p || !canWork(user, p.ownerId)) return { ok: false };
  try {
    await putChunk(fileId, seq, new Uint8Array(await chunk.arrayBuffer()));
    return { ok: true };
  } catch (e) {
    logError("profiles/upload-chunk", e, { fileId, seq });
    return { ok: false };
  }
}

export async function finishAppraisalUploadAction(fileId: string): Promise<{ ok: boolean; doc?: ProfileDoc; error?: string }> {
  const user = await requireUser();
  const f = UUID.test(String(fileId)) ? await getFile(fileId) : null;
  const p = f ? await getProfile(f.profileId) : null;
  if (!f || !p || !canWork(user, p.ownerId)) return { ok: false, error: "Upload not found." };
  const done = await finishFile(fileId);
  if (!done.ok) return done;
  const doc = (await listProfileDocs([p.id])).get(p.id)?.find((d) => d.id === fileId);
  return { ok: true, doc };
}

export async function deleteAppraisalAction(fileId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const f = UUID.test(String(fileId)) ? await getFile(fileId) : null;
  const p = f ? await getProfile(f.profileId) : null;
  if (!f || !p || !canWork(user, p.ownerId)) return { ok: false };
  await deleteFile(fileId);
  return { ok: true };
}

/** The profile as it is now: on opening (the browser's back button can show an old copy) and when the tab comes back into view. */
export async function refreshProfileAction(id: string): Promise<{ ok: boolean; profile?: ProfileSnapshot }> {
  await requireUser();
  const p = typeof id === "string" && UUID.test(id) ? await getProfile(id) : null;
  if (!p) return { ok: false };
  const docs = (await listProfileDocs([p.id])).get(p.id) ?? [];
  return { ok: true, profile: snapshotOf(p, docs) };
}
