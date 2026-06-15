import Link from "next/link";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ResetPasswordForm } from "./form";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [u] = await db.select().from(users).where(eq(users.setupToken, token)).limit(1);
  const expired = !!u?.setupTokenExpiresAt && u.setupTokenExpiresAt.getTime() < Date.now();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Reset password</h1>
        {!u ? (
          <>
            <p className="mt-2 text-sm text-slate-500">
              This reset link is invalid or has already been used. Request a new one from the sign-in page.
            </p>
            <p className="mt-4 text-center text-xs text-slate-500">
              <Link href="/forgot-password" className="text-slate-700 underline-offset-2 hover:underline">
                Request a new reset link
              </Link>
            </p>
          </>
        ) : expired ? (
          <>
            <p className="mt-2 text-sm text-red-700">
              This reset link has expired. Request a new one — they&apos;re valid for 1 hour.
            </p>
            <p className="mt-4 text-center text-xs text-slate-500">
              <Link href="/forgot-password" className="text-slate-700 underline-offset-2 hover:underline">
                Request a new reset link
              </Link>
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500">
              Hi {u.name} — choose a new password to sign back in.
            </p>
            <ResetPasswordForm token={token} />
          </>
        )}
      </div>
    </div>
  );
}
