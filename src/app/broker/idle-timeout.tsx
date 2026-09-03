"use client";
import { useEffect, useRef, useState } from "react";

// Client half of the idle timeout. The SERVER is the control — getCurrentBrokerUser
// deletes the session past the idle window, so a tampered-with or disabled
// script buys nothing. This exists because server-side expiry alone leaves the
// stock list sitting on screen until someone next navigates, and an unattended
// screen showing confidential stock is the thing the timeout is for.
//
// Warns a minute out rather than dropping them mid-sentence.
export function IdleTimeout({ idleMinutes }: { idleMinutes: number }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // Seeded in the effect, not here: Date.now() during render is impure and
  // would give a different answer on every re-render.
  const lastActive = useRef(0);

  useEffect(() => {
    lastActive.current = Date.now();
    const idleMs = idleMinutes * 60_000;
    const warnMs = 60_000;

    const bump = () => {
      lastActive.current = Date.now();
      setSecondsLeft(null);
    };
    // Passive: these fire constantly and must never delay a scroll.
    const opts = { passive: true } as const;
    for (const ev of ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"]) {
      window.addEventListener(ev, bump, opts);
    }

    const tick = setInterval(() => {
      const idleFor = Date.now() - lastActive.current;
      if (idleFor >= idleMs) {
        // Full navigation, not a router push: this must tear down the page
        // and its data, not soft-navigate with everything still in memory.
        window.location.href = "/broker/login?timeout=1";
        return;
      }
      setSecondsLeft(idleFor >= idleMs - warnMs ? Math.ceil((idleMs - idleFor) / 1000) : null);
    }, 1000);

    return () => {
      for (const ev of ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"]) {
        window.removeEventListener(ev, bump);
      }
      clearInterval(tick);
    };
  }, [idleMinutes]);

  if (secondsLeft === null) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-[2147483646] flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-medium text-white shadow-lg">
        <span>Signing you out in {secondsLeft}s — move the mouse to stay.</span>
      </div>
    </div>
  );
}
