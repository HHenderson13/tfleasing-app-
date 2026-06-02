"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";

// Fire confetti once per (user, month, badgeKey) — we remember which
// achievements the exec has already seen by stashing the set in
// localStorage so they only get the firework moment when something is
// genuinely new. If they hit the same badge again in a later month it
// will fire again (different key).

export function PodiumConfetti({ userId, yearMonth, badgeKeys }: { userId: string; yearMonth: string; badgeKeys: string[] }) {
  useEffect(() => {
    if (badgeKeys.length === 0) return;
    const storeKey = `polepos:celebrated:${userId}:${yearMonth}`;
    let already: string[] = [];
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) already = JSON.parse(raw);
    } catch { /* corrupted storage — treat as no history */ }
    const seen = new Set(already);
    const fresh = badgeKeys.filter((k) => !seen.has(k));
    if (fresh.length === 0) return;

    // Stagger so multiple fresh badges feel like a chain reaction rather
    // than one big puff.
    fresh.forEach((_, i) => {
      window.setTimeout(() => {
        confetti({
          particleCount: 80,
          spread: 75,
          origin: { y: 0.3 },
          colors: ["#f59e0b", "#fbbf24", "#fb7185", "#a855f7", "#06b6d4"],
        });
        // A second burst from the side for that "popping" feel.
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 65,
          origin: { x: 0, y: 0.5 },
        });
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 65,
          origin: { x: 1, y: 0.5 },
        });
      }, i * 350);
    });

    try {
      localStorage.setItem(storeKey, JSON.stringify(Array.from(new Set([...already, ...fresh]))));
    } catch { /* quota/private mode — confetti will fire again next visit, no harm */ }
  }, [userId, yearMonth, badgeKeys]);

  return null;
}
