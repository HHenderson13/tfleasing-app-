"use client";
import { useEffect, useRef, useState } from "react";
import { WATERMARK_FAINT, WATERMARK_LOUD, watermarkBackground, watermarkStamp, type WatermarkStrength } from "@/lib/broker-watermark-tile";

// ─── Capture deterrence for the broker portal ──────────────────────────────
//
// Read the header comment in lib/broker-watermark.ts first: a web page
// cannot stop a screenshot, and nothing below changes that. What is here is
// arranged in order of how much it actually achieves:
//
//   1. The watermark (server-rendered, enforced here). The only measure
//      that survives a successful capture, because it travels inside the
//      picture. This is the real one.
//   2. The shield. Hides content whenever the page is not focused or not
//      visible. Defeats the mobile app-switcher snapshot, screen sharing
//      while tabbed away, and remote-capture tools that steal focus. It
//      does NOT defeat macOS Cmd+Shift+4, which never blurs the window.
//   3. Print blocking. Ctrl/Cmd+P and print-to-PDF are a clean, high-
//      quality capture route, and unlike screenshots they ARE blockable.
//   4. Copy / selection / context-menu / drag blocking. Stops the lazy
//      routes to the underlying text.
//   5. Reporting. Everything we can observe is attributed to a named user
//      in broker_security_events.
//
// None of it stops a determined person with a phone camera. It is not meant
// to. It raises effort, removes the effortless routes, and makes what does
// get out traceable.

const REPORT_URL = "/api/broker/security-event";

type Kind =
  | "print-screen-key" | "print" | "capture-shortcut" | "watermark-tamper"
  | "devtools" | "copy" | "context-menu" | "screen-share";

export function ScreenGuard({
  watermarkId,
  viewerName,
  viewerEmail,
  brokerName,
  watermarkPrefix,
  watermarkSuffix,
  watermarkPrimary,
  watermarkDense,
}: {
  watermarkId: string;
  viewerName: string;
  viewerEmail: string;
  brokerName: string;
  // The detail line is rebuilt here as `prefix + <now> + suffix` so the
  // timestamp can tick. See the refresh block below for why.
  watermarkPrefix: string;
  watermarkSuffix: string;
  watermarkPrimary: string;
  watermarkDense: string;
}) {
  // Shield state is the only thing that needs to re-render.
  const [shielded, setShielded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The caught-you dialog. Deliberately a dialog and not a toast: it has to
  // be acknowledged, so it cannot be missed or scrolled past, and the act of
  // dismissing it is the broker confirming they read the terms.
  const [caught, setCaught] = useState<string | null>(null);
  // Never report the same kind more than a few times per page view — a
  // stuck key or a tamper loop must not turn into a write amplifier.
  const counts = useRef<Record<string, number>>({});
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const report = (kind: Kind, detail?: unknown) => {
      const n = (counts.current[kind] ?? 0) + 1;
      counts.current[kind] = n;
      if (n > 5) return;
      const body = JSON.stringify({ kind, path: location.pathname, detail });
      // sendBeacon survives the page being torn down, which matters when
      // the trigger is a print or a tab switch.
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon(REPORT_URL, new Blob([body], { type: "application/json" }));
          return;
        }
      } catch { /* fall through to fetch */ }
      fetch(REPORT_URL, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    };

    const flash = (msg: string) => {
      setNotice(msg);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      noticeTimer.current = setTimeout(() => setNotice(null), 4000);
    };
    // Used where we are fairly confident a capture actually happened.
    const confront = (what: string) => setCaught(what);

    // ── 1. Watermark enforcement ──────────────────────────────────────────
    // The watermark is server-rendered, so it is already in the HTML. This
    // watches for it being deleted or neutered in DevTools and puts it back.
    // Two strikes and the content goes instead: if someone is editing the
    // DOM to strip attribution, they have told us what they are doing.
    let tamperCount = 0;
    // Captured once, before any tampering, and used to restore the layer.
    // The timestamp refresh writes backgroundImage directly, so restoring
    // this and then refreshing puts back a current tile, not a stale one.
    const wmSnapshot = (() => {
      const el = document.getElementById(watermarkId);
      return el ? el.getAttribute("style") ?? "" : "";
    })();

    const checkWatermark = () => {
      const el = document.getElementById(watermarkId);
      if (!el) {
        tamperCount++;
        report("watermark-tamper", { reason: "removed", count: tamperCount });
        if (tamperCount >= 2) setShielded(true);
        return;
      }
      const cs = getComputedStyle(el);
      const broken =
        cs.display === "none" ||
        cs.visibility === "hidden" ||
        Number(cs.opacity) < 0.5 ||
        cs.backgroundImage === "none";
      if (broken) {
        tamperCount++;
        report("watermark-tamper", { reason: "styled-out", count: tamperCount });
        el.setAttribute("style", wmSnapshot);
        refreshWatermark();
        if (tamperCount >= 2) setShielded(true);
      }
    };

    // Faint all day; loud the moment a capture chord is seen — see
    // WATERMARK_FAINT / WATERMARK_LOUD in lib/broker-watermark-tile.ts.
    let strength: WatermarkStrength = WATERMARK_FAINT;
    let loudTimer: ReturnType<typeof setTimeout> | null = null;

    // ── Ticking timestamp ─────────────────────────────────────────────────
    // On iOS and Android a screenshot uses hardware buttons the browser
    // never sees: no event, no alert, no dialog. The watermark is the only
    // trace, so the time it carries is the only forensic anchor there is —
    // and a page left open all morning would otherwise stamp every capture
    // with the time the tab was opened. Repainting once a minute pins a
    // leaked mobile screenshot to the minute it was actually taken.
    const refreshWatermark = () => {
      const el = document.getElementById(watermarkId);
      if (!el) return;
      const lines = {
        primary: watermarkPrimary,
        secondary: `${watermarkPrefix}${watermarkStamp(new Date())}${watermarkSuffix}`,
        dense: watermarkDense,
      };
      el.style.backgroundImage = watermarkBackground(lines, strength);
    };
    const stampTimer = setInterval(refreshWatermark, 60_000);

    // A region snip and a screen recording both take a beat between the
    // chord and the actual capture, so this repaint lands inside them.
    // Held afterwards because a recording keeps running.
    const goLoud = (holdMs = 12_000) => {
      strength = WATERMARK_LOUD;
      refreshWatermark();
      if (loudTimer) clearTimeout(loudTimer);
      loudTimer = setTimeout(() => {
        strength = WATERMARK_FAINT;
        refreshWatermark();
      }, holdMs);
    };

    const observer = new MutationObserver(checkWatermark);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden"] });
    const wmTimer = setInterval(checkWatermark, 2000);

    // ── 2. The shield ─────────────────────────────────────────────────────
    const hide = () => setShielded(true);
    const show = () => setShielded(false);
    const onVisibility = () => (document.hidden ? hide() : show());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", hide);
    window.addEventListener("focus", show);
    window.addEventListener("pagehide", hide);

    // ── 3. Print ──────────────────────────────────────────────────────────
    // The CSS in the server component blanks the page for print media; this
    // is the belt to that braces, plus the report.
    const onBeforePrint = () => { hide(); goLoud(); report("print"); confront("You have just tried to print this page."); };
    window.addEventListener("beforeprint", onBeforePrint);
    const printMq = window.matchMedia("print");
    const onPrintMq = (e: MediaQueryListEvent) => { if (e.matches) { hide(); report("print"); } };
    printMq.addEventListener?.("change", onPrintMq);

    // ── 4. Keyboard ───────────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key;
      const meta = e.ctrlKey || e.metaKey;

      // macOS screenshot chords. We can see the keydown even though we
      // cannot stop the capture — preventDefault does nothing here, the OS
      // has already taken it. Worth recording precisely because it means
      // a screenshot almost certainly just happened.
      if (e.metaKey && e.shiftKey && ["3", "4", "5", "6"].includes(k)) {
        report("capture-shortcut", { chord: `Cmd+Shift+${k}` });
        // 5 is the recorder / region toolbar and can run for minutes.
        goLoud(k === "5" ? 60_000 : 12_000);
        confront(k === "5" ? "You have just started a screen recording." : "You have just taken a screenshot.");
        return;
      }
      // Windows snipping tool: Win+Shift+S. Windows normally swallows this
      // before the page sees it, so catching it is a bonus rather than
      // something to rely on — the watermark is what covers the snip either
      // way. metaKey is the Windows key in Chrome/Edge; "OS" is the older
      // Firefox spelling.
      const winKey = e.metaKey || e.getModifierState?.("Meta") || e.getModifierState?.("OS");
      if (winKey && e.shiftKey && k.toUpperCase() === "S") {
        report("capture-shortcut", { chord: "Win+Shift+S" });
        goLoud();
        confront("You have just opened the screen snipping tool.");
        return;
      }
      // Windows / Linux. PrintScreen usually reaches us on keyup, not
      // keydown, and never at all in some browsers.
      if (k === "PrintScreen" || k === "Snapshot") {
        report("print-screen-key");
        goLoud();
        confront("You have just taken a screenshot.");
        return;
      }
      // Print and save: these we genuinely can block.
      if (meta && (k === "p" || k === "P")) { e.preventDefault(); report("print"); confront("You have just tried to print this page."); return; }
      if (meta && (k === "s" || k === "S")) { e.preventDefault(); flash("Saving this page is disabled."); return; }
      // DevTools shortcuts. Blocking these is a speed bump, not a lock —
      // the menu still opens them. Recorded, not fought.
      if (k === "F12" || (meta && e.shiftKey && ["I", "J", "C"].includes(k.toUpperCase()))) {
        report("devtools", { via: "shortcut" });
        e.preventDefault();
        return;
      }
      if (meta && (k === "u" || k === "U")) { e.preventDefault(); return; }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen" || e.key === "Snapshot") {
        report("print-screen-key");
        // Overwriting the clipboard is the one lever we have on Windows:
        // the capture went to the clipboard, so replace it before it can be
        // pasted anywhere. Fails silently without clipboard permission.
        navigator.clipboard?.writeText("Screenshots of this stock list are not permitted.").catch(() => {});
        confront("You have just taken a screenshot.");
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);

    // ── 5. Copy, context menu, drag ───────────────────────────────────────
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      e.clipboardData?.setData("text/plain", "Copied from the stock portal. Contact your account manager for stock details.");
      report("copy");
      flash("Copying is disabled. Quote the vehicle reference instead.");
    };
    const onContext = (e: MouseEvent) => { e.preventDefault(); report("context-menu"); };
    const onDragStart = (e: DragEvent) => e.preventDefault();
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("dragstart", onDragStart);

    // ── 6. Screen sharing started from this page ──────────────────────────
    // Only catches getDisplayMedia called from our own origin — i.e. the
    // "share this tab" flow. Zoom and OBS are invisible to us.
    const md = navigator.mediaDevices as MediaDevices | undefined;
    const originalGdm = md?.getDisplayMedia?.bind(md);
    if (md && originalGdm) {
      md.getDisplayMedia = ((...args: Parameters<MediaDevices["getDisplayMedia"]>) => {
        report("screen-share");
        // A share runs until they stop it, so hold the loud watermark for
        // as long as we plausibly can rather than the usual few seconds.
        goLoud(10 * 60_000);
        return originalGdm(...args);
      }) as MediaDevices["getDisplayMedia"];
    }

    // ── 7. DevTools heuristic ─────────────────────────────────────────────
    // Docked DevTools shrink the viewport relative to the window. Noisy
    // enough that it only ever reports — it never blocks, because a narrow
    // window would otherwise lock a legitimate user out.
    let devtoolsSeen = false;
    const devtoolsTimer = setInterval(() => {
      const gap = Math.abs(window.outerWidth - window.innerWidth) > 220 ||
                  Math.abs(window.outerHeight - window.innerHeight) > 220;
      if (gap && !devtoolsSeen) { devtoolsSeen = true; report("devtools", { via: "viewport-gap" }); }
      if (!gap) devtoolsSeen = false;
    }, 3000);

    return () => {
      observer.disconnect();
      clearInterval(wmTimer);
      clearInterval(stampTimer);
      if (loudTimer) clearTimeout(loudTimer);
      clearInterval(devtoolsTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", show);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("beforeprint", onBeforePrint);
      printMq.removeEventListener?.("change", onPrintMq);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("dragstart", onDragStart);
      if (md && originalGdm) md.getDisplayMedia = originalGdm;
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [watermarkId, watermarkPrefix, watermarkSuffix, watermarkPrimary, watermarkDense]);

  return (
    <>
      {/* The shield. Fixed, opaque, above everything including the
          watermark — whatever is captured while it is up shows this and
          not the stock list. */}
      {shielded && (
        <div
          className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-slate-900/97 px-6 text-center"
          onClick={() => setShielded(false)}
          role="presentation"
        >
          <div className="max-w-sm">
            <div className="text-sm font-semibold text-white">Content hidden</div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              Stock details are hidden while this window is inactive. Click anywhere to continue.
            </p>
            <p className="mt-4 text-[11px] text-slate-500">
              This page is watermarked with your name, and attempts to capture it are recorded.
            </p>
          </div>
        </div>
      )}
      {notice && (
        <div className="fixed inset-x-0 bottom-4 z-[2147483647] flex justify-center px-4">
          <div className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-medium text-white shadow-lg">{notice}</div>
        </div>
      )}

      {/* The confrontation. Named, specific, and it has to be dismissed —
          the point is that the person holding the screenshot knows we know,
          and knows their name is on it, before they decide what to do with
          it. That decision is the only place any of this has leverage. */}
      {caught && (
        <div
          className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/80 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="tf-caught-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100">
                <svg viewBox="0 0 20 20" aria-hidden className="h-5 w-5 fill-red-600">
                  <path d="M10 1.6 1.3 17.2h17.4L10 1.6Zm0 5.1c.5 0 .9.4.9.9v4a.9.9 0 0 1-1.8 0v-4c0-.5.4-.9.9-.9Zm0 8.6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 id="tf-caught-title" className="text-base font-semibold text-slate-900">{caught}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  This stock list is provided to <strong>{viewerName}</strong> at <strong>{brokerName}</strong> for
                  your own use. It must not be shared, forwarded, posted or shown outside {brokerName}.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Whatever you have captured is stamped with your name, <strong>{viewerEmail}</strong>, and the time
                  you took it. This has been reported.
                </p>
              </div>
            </div>
            <button
              onClick={() => setCaught(null)}
              autoFocus
              className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              I understand
            </button>
          </div>
        </div>
      )}
    </>
  );
}
