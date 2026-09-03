"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePreRegVehicleAction } from "./actions";
import { pairByPosition, parseRegNumbers, parseVinList } from "@/lib/reg-numbers";

export interface Choices {
  bucket: string[];
  variant: string[];
  derivative: string[];
  bodyStyle: string[];
  engine: string[];
  transmission: string[];
  drive: string[];
  colour: string[];
  modelYear: string[];
  dealer: string[];
  destination: string[];
}

const OTHER = "__other__";

// Every field is a dropdown of what the existing stock actually contains,
// with an "Other" that turns into a text box. The lists come from thousands
// of real vehicles, so the common case is picking; the escape hatch exists
// because a pre-reg is often the first of something.
function Field({
  name, label, options, required, placeholder,
}: {
  name: string;
  label: string;
  options: string[];
  required?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const custom = value === OTHER;
  return (
    <label className="flex flex-col text-xs font-medium text-slate-700">
      {label}{required && <span className="text-red-600"> *</span>}
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required={required && !custom}
        // Named only while a real value is picked, so the free-text input
        // below owns the field name when "Other" is chosen.
        name={custom ? undefined : name}
        className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
      >
        <option value="">{required ? "Choose…" : "—"}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value={OTHER}>Other — type it in…</option>
      </select>
      {custom && (
        <input
          name={name}
          required={required}
          autoFocus
          placeholder={placeholder ?? `New ${label.toLowerCase()}`}
          className="mt-1 rounded-lg border border-violet-300 bg-violet-50/40 px-3 py-1.5 text-sm"
        />
      )}
    </label>
  );
}

export function PreRegForm({ choices }: { choices: Choices }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Parsed as they type, so the count is visible before submitting — pasting
  // a column and getting nineteen rows from twenty lines should be obvious
  // straight away, not discovered afterwards.
  const [regsText, setRegsText] = useState("");
  const [vinsText, setVinsText] = useState("");
  const parsed = parseRegNumbers(regsText);
  const vinList = parseVinList(vinsText);
  // Same check the server runs, so a length mismatch is visible while typing
  // rather than after submitting.
  const pairing = pairByPosition(parsed.vehicles, vinList.vins);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const el = e.currentTarget;
    setError(null);
    setSaved(null);
    start(async () => {
      const res = await savePreRegVehicleAction(form);
      if (!res.ok) { setError(res.error); return; }
      el.reset();
      setRegsText("");
      setVinsText("");
      const bits = [`Added ${res.created} vehicle${res.created === 1 ? "" : "s"}.`];
      if (res.skipped.length) bits.push(`Already on the system, skipped: ${res.skipped.join(", ")}.`);
      if (res.duplicates.length) bits.push(`Listed twice, added once: ${res.duplicates.join(", ")}.`);
      setSaved(bits.join(" "));
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field name="bucket" label="Model" options={choices.bucket} required />
        <Field name="variant" label="Variant / series" options={choices.variant} />
        <Field name="derivative" label="Derivative" options={choices.derivative} />
        <Field name="colour" label="Colour" options={choices.colour} required />
        <Field name="engine" label="Engine" options={choices.engine} />
        <Field name="transmission" label="Transmission" options={choices.transmission} />
        <Field name="drive" label="Drive" options={choices.drive} />
        <Field name="bodyStyle" label="Body style" options={choices.bodyStyle} />
        <Field name="modelYear" label="Model year" options={choices.modelYear} />
        <Field name="dealer" label="Dealer" options={choices.dealer} />
        <Field name="destination" label="Destination" options={choices.destination} />
      </div>

      <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col text-xs font-medium text-slate-700">
          Date of registration<span className="text-red-600"> *</span>
          <input name="registeredAt" type="date" required className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-700">
          Notes <span className="font-normal text-slate-400">(internal)</span>
          <input name="notes" className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col text-xs font-medium text-slate-700">
          Registration numbers<span className="text-red-600"> *</span>{" "}
          <span className="font-normal text-slate-400">— one per line</span>
          <textarea
            name="regNumbers"
            required
            rows={6}
            value={regsText}
            onChange={(e) => setRegsText(e.target.value)}
            placeholder={"AB12 CDE\nEF13 GHI\nJK14 LMN"}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm uppercase"
          />
        </label>
        <label className="flex flex-col text-xs font-medium text-slate-700">
          VINs <span className="font-normal text-slate-400">— optional, one per line, same order as the registrations</span>
          <textarea
            name="vins"
            rows={6}
            value={vinsText}
            onChange={(e) => setVinsText(e.target.value)}
            placeholder={"E00R5580811\nE02R5580812\nE09R5581875"}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 font-mono text-sm uppercase"
          />
        </label>
      </div>

      {/* The pairing is positional, so the counts have to be visible while
          typing — a mismatch found after submitting is a mismatch that has
          already put VINs on the wrong cars in someone's head. */}
      <div className="mt-2 text-[11px]">
        <span className="text-slate-500">
          {parsed.vehicles.length === 0
            ? "No registrations entered yet."
            : `${parsed.vehicles.length} registration${parsed.vehicles.length === 1 ? "" : "s"}`}
          {vinList.vins.length > 0 && <span className="text-slate-500">{` · ${vinList.vins.length} VIN${vinList.vins.length === 1 ? "" : "s"}`}</span>}
        </span>
        {!pairing.ok && <span className="ml-1 font-medium text-red-600">{pairing.reason}</span>}
        {pairing.ok && parsed.vehicles.length > 0 && (
          <span className="ml-1 text-emerald-700">
            {vinList.vins.length > 0
              ? `— paired in order, ${parsed.vehicles.length} vehicle${parsed.vehicles.length === 1 ? "" : "s"} will be created.`
              : `— ${parsed.vehicles.length} vehicle${parsed.vehicles.length === 1 ? "" : "s"} will be created, no VINs.`}
          </span>
        )}
        {vinList.invalid.length > 0 && (
          <span className="ml-1 text-red-600">Not a VIN (11 or 17 characters): {vinList.invalid.slice(0, 3).join(", ")}.</span>
        )}
        {parsed.duplicateRegs.length > 0 && (
          <span className="ml-1 text-amber-700">Listed twice, added once: {parsed.duplicateRegs.join(", ")}.</span>
        )}
        {vinList.duplicates.length > 0 && (
          <span className="ml-1 text-amber-700">VIN listed twice: {vinList.duplicates.join(", ")}.</span>
        )}
      </div>

      <label className="mt-3 flex flex-col text-xs font-medium text-slate-700">
        Factory options <span className="font-normal text-slate-400">(one per line)</span>
        <textarea name="options" rows={3} className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pending || parsed.vehicles.length === 0 || !pairing.ok} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
          {pending
            ? "Adding…"
            : parsed.vehicles.length > 1
              ? `Add ${parsed.vehicles.length} pre-registered vehicles`
              : "Add pre-registered vehicle"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
        {saved && !error && <span className="text-xs text-emerald-700">{saved}</span>}
      </div>
    </form>
  );
}
