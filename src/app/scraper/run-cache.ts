"use client";

import type { Listing } from "@/lib/market-slots";

// Runs are ~30k listings (~4MB) and never change once uploaded, and the
// Intelligence and Trends tabs both need them. Each tab unmounts when you
// leave it, so without this every tab switch downloaded the run again.
// Kept to a few runs: Trends compares two, Intelligence shows one.
const MAX_RUNS = 3;
const PER_PAGE = 10000;
const cache = new Map<string, Promise<Listing[]>>();

type Progress = (loaded: number, total: number) => void;

async function fetchRun(runId: string, onProgress?: Progress): Promise<Listing[]> {
  const url = (page: number) =>
    `/api/scraper/results?runId=${encodeURIComponent(runId)}&slim=true&page=${page}&per_page=${PER_PAGE}`;
  // First page tells us how many pages exist
  const firstRes = await fetch(url(1));
  if (!firstRes.ok) throw new Error(`Couldn't load run ${runId} (${firstRes.status})`);
  const first = (await firstRes.json()) as { results: Listing[]; total: number; pages: number };
  const all: Listing[] = [...first.results];
  onProgress?.(all.length, first.total);

  // Remaining pages in parallel
  if (first.pages > 1) {
    const rest = await Promise.all(
      Array.from({ length: first.pages - 1 }, async (_, i) => {
        const r = await fetch(url(i + 2));
        if (!r.ok) throw new Error(`Couldn't load run ${runId} (${r.status})`);
        return ((await r.json()) as { results: Listing[] }).results;
      })
    );
    for (const page of rest) all.push(...page);
  }
  return all;
}

export function loadRun(runId: string, onProgress?: Progress): Promise<Listing[]> {
  const hit = cache.get(runId);
  if (hit) {
    // Most recently used goes to the back.
    cache.delete(runId);
    cache.set(runId, hit);
    return hit;
  }
  const p = fetchRun(runId, onProgress).catch((e) => {
    cache.delete(runId); // a failed load must not stick
    throw e;
  });
  cache.set(runId, p);
  while (cache.size > MAX_RUNS) cache.delete(cache.keys().next().value!);
  return p;
}
