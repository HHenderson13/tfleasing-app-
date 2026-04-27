"use client";
import { CopyBtn } from "./forms";

export function InviteLink({ token }: { token: string }) {
  const url = typeof window !== "undefined" ? `${window.location.origin}/setup/${token}` : `/setup/${token}`;
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 p-2 ring-1 ring-amber-200">
      <span className="text-[11px] font-medium uppercase tracking-wide text-amber-700">Setup link</span>
      <code className="flex-1 truncate text-[11px] text-slate-700">{url}</code>
      <CopyBtn text={url} />
    </div>
  );
}
