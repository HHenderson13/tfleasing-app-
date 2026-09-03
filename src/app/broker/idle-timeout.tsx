"use client";
import { useEffect, useRef, useState } from "react";

// Client half of the idle timeout, and the session heartbeat.
//
// The SERVER is the control — getCurrentBrokerUser deletes the session past
// the idle window, so a tampered-with or disabled script buys nothing. This
// exists to do three things a page cannot otherwise do:
//
//   1. Clear the screen. Server-side expiry alone leaves the stock list
//      sitting there until someone next navigates, and an unattended screen
//      showing confidential stock is the whole point of the timeout.
//   2. Keep the server's idle clock honest. The stock list filters entirely
//      in the browser, so a broker can work for half an hour without making
//      one request — lastSeenAt would go stale while they were busy and the
//      server would idle them out mid-use. The heartbeat reports real input
//      so that cannot happen. It reports honestly: no input, no bump, or an
//      abandoned tab would keep itself signed in forever.
//   3. Notice being displaced. One session per broker user, so signing in
//      elsewhere kills this one; the 401 is how this device finds out
//      instead of sitting on stale stock.
//
// Warns a minute out rather than dropping them mid-sentence.
// What counts as "still using it". Deliberate interaction only —
// mousemove is deliberately NOT here. A nudged desk, a jittery trackpad or
// someone walking past a laptop would otherwise hold a session open on an
// unattended screen indefinitely, which is the exact thing the idle timeout
// exists to prevent. Clicking, typing, scrolling and tapping are things a
// person does on purpose.
//
// wheel is listed alongside scroll because a trackpad over an inner
// scrolling panel (the facet lists) does not always fire a window scroll.
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "wheel", "touchstart"] as const;

export function IdleTimeout({ idleMinutes }: { idleMinutes: number }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // Set when the heartbeat comes back 401. Covers the stock list at once —
  // the session is already gone, so nothing behind this should still be
  // readable — and says why before sending them to the login page.
  const [displaced, setDisplaced] = useState(false);
  // Seeded in the effect, not here: Date.now() during render is impure and
  // would give a different answer on every re-render.
  const lastActive = useRef(0);

  useEffect(() => {
    lastActive.current = Date.now();
    const idleMs = idleMinutes * 60_000;
    const warnMs = 60_000;

    let activeSinceBeat = false;
    const bump = () => {
      lastActive.current = Date.now();
      activeSinceBeat = true;
      setSecondsLeft(null);
    };
    // Passive: these fire often and must never delay a scroll.
    const opts = { passive: true } as const;
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, bump, opts);

    const signOut = (reason: "timeout" | "elsewhere") => {
      window.location.href = `/broker/login?${reason === "timeout" ? "timeout=1" : "elsewhere=1"}`;
    };

    // Every 30s: tell the server whether there has been real input since the
    // last beat, and find out whether this session still exists.
    const beat = setInterval(async () => {
      const wasActive = activeSinceBeat;
      activeSinceBeat = false;
      try {
        const res = await fetch("/api/broker/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: wasActive }),
        });
        if (res.status === 401) {
          // Cover the screen immediately, then navigate. Redirecting straight
          // away would clear it just as fast but leave them wondering what
          // happened; five seconds is long enough to read one sentence.
          setDisplaced(true);
          clearInterval(beat);
          setTimeout(() => signOut("elsewhere"), 5000);
        }
      } catch {
        // Offline or a flaky connection is not a reason to sign someone out;
        // the server clock still holds regardless.
      }
    }, 30_000);

    const tick = setInterval(() => {
      const idleFor = Date.now() - lastActive.current;
      if (idleFor >= idleMs) {
        // Full navigation, not a router push: this must tear down the page
        // and its data, not soft-navigate with everything still in memory.
        signOut("timeout");
        return;
      }
      setSecondsLeft(idleFor >= idleMs - warnMs ? Math.ceil((idleMs - idleFor) / 1000) : null);
    }, 1000);

    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, bump);
      clearInterval(tick);
      clearInterval(beat);
    };
  }, [idleMinutes]);

  if (displaced) {
    return (
      <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/95 px-6 text-center">
        <div className="max-w-sm">
          <h2 className="text-base font-semibold text-white">You&apos;ve been signed out</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            This account has just signed in on another device. Only one device can be signed in at a time.
          </p>
          <a
            href="/broker/login?elsewhere=1"
            className="mt-5 inline-block rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100"
          >
            Sign in again
          </a>
        </div>
      </div>
    );
  }

  if (secondsLeft === null) return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-[2147483646] flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-medium text-white shadow-lg">
        <span>Signing you out in {secondsLeft}s — click or scroll to stay.</span>
      </div>
    </div>
  );
}
