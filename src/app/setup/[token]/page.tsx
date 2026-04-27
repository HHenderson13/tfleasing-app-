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
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">TrustFord Leasing</h1>
        {!u ? (
          <p className="mt-2 text-sm text-slate-500">This setup link is invalid or has already been used. Ask an administrator for a new one.</p>
        ) : expired ? (
          <p className="mt-2 text-sm text-red-700">This setup link has expired. Ask an administrator for a new one.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500">Welcome, {u.name}. Choose a password to finish setting up your account.</p>
            <SetupForm token={token} />
          </>
        )}
      </div>
    </div>
  );
}
