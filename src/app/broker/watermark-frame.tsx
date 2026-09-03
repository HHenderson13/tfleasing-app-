import { cookies } from "next/headers";
import { BROKER_SESSION_COOKIE, type CurrentBrokerUser } from "@/lib/broker-auth";
import { WATERMARK_REST, sessionTag, watermarkBackground, watermarkLines } from "@/lib/broker-watermark";
import { ScreenGuard } from "./screen-guard";
import { IdleTimeout } from "./idle-timeout";
import { SESSION_IDLE_MINUTES } from "@/lib/broker-auth";

const WATERMARK_ID = "tf-broker-wm";

// Wraps anything a broker is shown. Server component on purpose: the
// watermark is baked into the delivered HTML, so it is painted on first
// render, survives JS being disabled, and appears in the page source. The
// client half (ScreenGuard) only enforces and reports.
export async function WatermarkFrame({
  me,
  children,
}: {
  me: CurrentBrokerUser;
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const sid = jar.get(BROKER_SESSION_COOKIE)?.value ?? "";
  const lines = watermarkLines(me, sid);
  // Server-rendered so the mark is in the delivered HTML and survives JS
  // being off. ScreenGuard escalates it for print and tab-share.
  const background = watermarkBackground(lines, WATERMARK_REST);
  const tag = sessionTag(sid);

  return (
    <>
      <style>{`
        /* Selection, long-press callout and drag are the effortless routes
           to the underlying text. Closing them costs a broker nothing:
           there is nothing on this page they are meant to copy except the
           vehicle reference, which is short enough to read out. */
        #tf-broker-content, #tf-broker-content * {
          -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none;
          -webkit-touch-callout: none;
          -webkit-user-drag: none;
        }
        /* Inputs must stay usable — the search box is the whole point of
           the page. */
        #tf-broker-content input, #tf-broker-content textarea, #tf-broker-content select {
          -webkit-user-select: text; -moz-user-select: text; -ms-user-select: text; user-select: text;
        }
        /* Print and print-to-PDF are a clean, high-resolution capture and,
           unlike a screenshot, genuinely blockable. Blank the page and say
           why. */
        @media print {
          body * { visibility: hidden !important; }
          #tf-broker-print-notice, #tf-broker-print-notice * { visibility: visible !important; }
          #tf-broker-print-notice {
            position: fixed !important; inset: 0 !important;
            display: flex !important; align-items: center; justify-content: center;
            padding: 3rem; text-align: center; font-family: ui-sans-serif, system-ui, sans-serif;
          }
        }
        #tf-broker-print-notice { display: none; }
        @media screen { #tf-broker-print-notice { display: none !important; } }
      `}</style>

      {/* Named, in words, above the content. The tiled watermark is the
          forensic record; this is the deterrent — a broker who has read
          this knows a screenshot points back at them before they take it. */}
      <div className="border-b border-amber-300 bg-amber-50">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-[12px] text-amber-900 sm:px-6">
          <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 shrink-0 fill-amber-600">
            <path d="M10 1.6 1.3 17.2h17.4L10 1.6Zm0 5.1c.5 0 .9.4.9.9v4a.9.9 0 0 1-1.8 0v-4c0-.5.4-.9.9-.9Zm0 8.6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
          </svg>
          {/* One line. The watermark itself is faint now, so this is what
              carries the deterrent day to day — it has to be readable, not
              a wall of text people stop seeing. */}
          <span>
            <span className="font-semibold">Watermarked to you.</span>{" "}
            Any screenshot, photo or recording of this page carries <strong>{me.email}</strong> and identifies you as
            the source. Not to be shared outside {me.brokerName}.
          </span>
          <span className="ml-auto whitespace-nowrap font-mono text-[11px] text-amber-700">ref {tag}</span>
        </div>
      </div>

      <div id="tf-broker-content" className="relative">
        {children}

        {/* Fixed, so it covers the viewport rather than the document: a
            screenshot captures the viewport, and this is what has to be in
            it. pointer-events:none keeps the page fully usable underneath. */}
        <div
          id={WATERMARK_ID}
          aria-hidden
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483000,
            pointerEvents: "none",
            // Dense email tile on top, detail tile behind, so even a small
            // crop carries a complete identifier — see broker-watermark-tile.ts.
            backgroundImage: background,
            backgroundRepeat: "repeat, repeat",
            opacity: 1,
            display: "block",
            visibility: "visible",
          }}
        />
      </div>

      <div id="tf-broker-print-notice">
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Printing is disabled</div>
          <div style={{ marginTop: 12, fontSize: 13 }}>
            This stock list cannot be printed or saved to PDF.
          </div>
          <div style={{ marginTop: 20, fontSize: 12 }}>
            Requested by {me.name} ({me.email}) — {me.brokerName} · ref {tag}
          </div>
        </div>
      </div>

      <IdleTimeout idleMinutes={SESSION_IDLE_MINUTES} />
      <ScreenGuard
        watermarkId={WATERMARK_ID}
        viewerName={me.name}
        viewerEmail={me.email}
        brokerName={me.brokerName}
        watermarkPrefix={`${me.brokerName} · `}
        watermarkSuffix={` · ${tag}`}
        watermarkPrimary={lines.primary}
        watermarkDense={lines.dense}
      />
    </>
  );
}
