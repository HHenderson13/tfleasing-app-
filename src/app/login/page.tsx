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
      <div className="w-full max-w-md rounded-2xl bg-white p-7 sm:p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_0_1px_rgba(15,23,42,0.07)]">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-slate-900">TrustFord Leasing</h1>
        {count === 0 ? (
          <>
            <p className="mt-1.5 text-[15px] leading-6 text-slate-600">Set up the first administrator account to get started.</p>
            <BootstrapForm />
          </>
        ) : (
          <>
            <p className="mt-1.5 text-[15px] leading-6 text-slate-600">Sign in to continue.</p>
            <LoginForm />
          </>
        )}
      </div>
    </div>
  );
}
