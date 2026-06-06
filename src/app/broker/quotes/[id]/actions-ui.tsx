"use client";
import { useTransition } from "react";
import { deleteBrokerQuoteAction } from "./actions";

export function QuoteActions({ quoteId }: { quoteId: string }) {
  const [pending, start] = useTransition();
  function del() {
    if (!confirm("Delete this quote? It'll be removed for everyone at your broker.")) return;
    start(() => deleteBrokerQuoteAction(quoteId));
  }
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => window.print()}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
      >
        Print
      </button>
      <button
        onClick={del}
        disabled={pending}
        className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}
