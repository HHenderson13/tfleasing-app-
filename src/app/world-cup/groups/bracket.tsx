import type { BracketCell as BracketCellData } from "@/lib/world-cup-data";

interface BracketProps {
  bracket: Record<BracketCellData["stage"], BracketCellData[]>;
}

// 5-column knockout bracket: R32 → R16 → QF → SF → Final, with the 3rd-place
// playoff as a separate card below. Horizontally scrollable on phones; on
// desktop, each round column is evenly spaced via flex grow so adjacent
// matches visually align with the round they feed into.
export function Bracket({ bracket }: BracketProps) {
  return (
    <div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex min-w-[860px] items-stretch gap-3">
          <Column title="Round of 32" cells={bracket.r32} />
          <Column title="Round of 16" cells={bracket.r16} />
          <Column title="Quarter-finals" cells={bracket.qf} />
          <Column title="Semi-finals" cells={bracket.sf} />
          <Column title="Final" cells={bracket.final} accent />
        </div>
      </div>

      {bracket.third.length > 0 && (
        <div className="mt-4 inline-flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50/50 p-4 shadow-sm">
          <span className="text-2xl">🥉</span>
          <div className="min-w-[260px]">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-orange-700">Third-place playoff</div>
            <div className="mt-1">
              <BracketCell cell={bracket.third[0]} compact={false} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Column({ title, cells, accent }: { title: string; cells: BracketCellData[]; accent?: boolean }) {
  return (
    <div className="flex w-44 shrink-0 flex-col">
      <div className={`mb-2 text-[10px] font-semibold uppercase tracking-wide ${accent ? "text-amber-700" : "text-slate-500"}`}>
        {title} <span className="text-slate-400">({cells.length})</span>
      </div>
      {/* Distribute the cells evenly down the column so adjacent-round matches
          line up roughly with the cell they advance into. */}
      <div className="flex flex-1 flex-col justify-around gap-3">
        {cells.map((cell) => <BracketCell key={cell.fixtureNumber} cell={cell} compact={!accent} />)}
      </div>
    </div>
  );
}

function BracketCell({ cell, compact }: { cell: BracketCellData; compact: boolean }) {
  const settled = !!cell.result;
  const isFinal = cell.stage === "final";
  const ring = isFinal
    ? "border-amber-300 bg-amber-50"
    : settled
      ? "border-emerald-200 bg-emerald-50/40"
      : "border-slate-200 bg-white";

  const teamRow = (name: string | null, goals: number | null, isWinner: boolean) => (
    <div className={`flex items-center justify-between gap-2 px-2 py-1 text-xs ${
      isWinner ? "font-semibold text-emerald-900" : name ? "text-slate-800" : "text-slate-400 italic"
    }`}>
      <span className="truncate">{name ?? "TBD"}</span>
      {goals !== null && (
        <span className={`font-mono tabular-nums ${isWinner ? "font-bold text-emerald-900" : "text-slate-700"}`}>{goals}</span>
      )}
    </div>
  );

  const winner = cell.result?.winnerTeam ?? null;
  return (
    <div className={`overflow-hidden rounded-lg border ${ring} shadow-sm`}>
      <div className="divide-y divide-slate-100">
        {teamRow(cell.team1, cell.result?.team1Goals ?? null, winner === cell.team1)}
        {teamRow(cell.team2, cell.result?.team2Goals ?? null, winner === cell.team2)}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-2 py-1 text-[10px] text-slate-500">
        <span>M{cell.fixtureNumber}</span>
        <span>{cell.kickoffAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
      </div>
      {!compact && cell.result?.winnerTeam && (
        <div className="border-t border-emerald-200 bg-emerald-100 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
          {cell.result.winnerTeam} wins
        </div>
      )}
    </div>
  );
}
