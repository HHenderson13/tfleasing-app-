import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SetupForm } from "./form";

export const dynamic = "force-dynamic";

export default async function SetupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [u] = await db.select().from(users).where(eq(users.setupToken, token)).limit(1);
  const expired = !!u?.setupTokenExpiresAt && u.setupTokenExpiresAt.getTime() < Date.now();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-7 sm:p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07)]">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-slate-900">TrustFord Leasing</h1>
        {!u ? (
          <p className="mt-2 text-[15px] leading-6 text-slate-600">This setup link is invalid or has already been used. Ask an administrator for a new one.</p>
        ) : expired ? (
          <p className="mt-2 text-sm text-red-700">This setup link has expired. Ask an administrator for a new one.</p>
        ) : (
          <>
            <p className="mt-1.5 text-[15px] leading-6 text-slate-600">Welcome, {u.name}. Choose a password to finish setting up your account.</p>
            <SetupForm token={token} />
          </>
        )}
      </div>
    </div>
  );
}
