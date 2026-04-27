import { redirect } from "next/navigation";
import { getCurrentUser, userCount } from "@/lib/auth";
import { LoginForm, BootstrapForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const me = await getCurrentUser();
  if (me) redirect("/");
  const count = await userCount();
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">TrustFord Leasing</h1>
        {count === 0 ? (
          <>
            <p className="mt-1 text-sm text-slate-500">Set up the first administrator account to get started.</p>
            <BootstrapForm />
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500">Sign in to continue.</p>
            <LoginForm />
          </>
        )}
      </div>
    </div>
  );
}
