"use client";
import { useState } from "react";
import Link from "next/link";

export function ExpandableDelivery({
  orderId,
  rowContent,
  deliveryContent,
}: {
  orderId: string;
  rowContent: React.ReactNode;
  deliveryContent: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="block w-full text-left"
      >
        {rowContent}
      </button>
      {open && (
        <div className="mt-1 space-y-2">
          {deliveryContent}
          <div className="text-right">
            <Link
              href={`/orders/${orderId}`}
              className="text-[11px] text-slate-400 hover:text-slate-700 hover:underline"
            >
              open full order →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
