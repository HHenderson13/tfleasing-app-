import { db } from "@/db";
import { brokers, brokerUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { BrokerSetupForm } from "./form";

export const dynamic = "force-dynamic";

export default async function BrokerSetupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [row] = await db
    .select({
      id: brokerUsers.id,
      name: brokerUsers.name,
      setupTokenExpiresAt: brokerUsers.setupTokenExpiresAt,
      brokerName: brokers.name,
    })
    .from(brokerUsers)
    .innerJoin(brokers, eq(brokerUsers.brokerId, brokers.id))
    .where(eq(brokerUsers.setupToken, token))
    .limit(1);
  const expired = !!row?.setupTokenExpiresAt && row.setupTokenExpiresAt.getTime() < Date.now();
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Broker portal</h1>
        {!row ? (
          <p className="mt-2 text-sm text-slate-500">This setup link is invalid or has already been used. Ask your broker administrator for a new one.</p>
        ) : expired ? (
          <p className="mt-2 text-sm text-red-700">This setup link has expired. Ask your broker administrator for a new one.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500">
              Welcome, {row.name}. You&apos;re setting up access to <strong>{row.brokerName}</strong>&apos;s broker account. Choose a password to finish.
            </p>
            <BrokerSetupForm token={token} />
          </>
        )}
      </div>
    </div>
  );
}
