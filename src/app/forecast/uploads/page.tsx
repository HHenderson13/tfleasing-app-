import { TopNav } from "@/components/top-nav";
import { requireAdmin } from "@/lib/auth-guard";
import {
  listForecastUploads,
  listForecastLinesForUpload,
} from "@/lib/forecast";
import { UploadsClient } from "./uploads-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ month?: string; upload?: string }>;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function ForecastUploadsPage({ searchParams }: PageProps) {
  await requireAdmin();
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : currentMonth();
  const focusUploadId = sp.upload ?? null;

  const uploads = await listForecastUploads();
  // If the user just uploaded a file, focus on its lines so we can surface
  // the "these registered in a previous month — allocate them" prompt.
  const focusUpload = focusUploadId ? uploads.find((u) => u.id === focusUploadId) ?? null : null;
  const focusLines = focusUpload ? await listForecastLinesForUpload(focusUpload.id) : [];

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav active="forecast" />
      <UploadsClient
        month={month}
        uploads={uploads.map((u) => ({
          id: u.id,
          source: u.source,
          monthYyyymm: u.monthYyyymm,
          filename: u.filename,
          rowCount: u.rowCount,
          uploadedAt: u.uploadedAt.toISOString(),
        }))}
        focusUpload={focusUpload ? {
          id: focusUpload.id,
          monthYyyymm: focusUpload.monthYyyymm,
          source: focusUpload.source,
          filename: focusUpload.filename,
        } : null}
        focusLines={focusLines.map((l) => ({
          id: l.id,
          customerName: l.customerName,
          model: l.model,
          vehicleType: l.vehicleType,
          defaultMonth: l.defaultMonth,
          overrideMonth: l.overrideMonth,
          effectiveMonth: l.effectiveMonth,
          regDate: l.regDate,
        }))}
      />
    </div>
  );
}
