import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, entraConfigured } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const ERRORS: Record<string, string> = {
  NotRegistered: "Your Microsoft account is not registered in Citrineland CRM. Ask an Admin to invite you.",
  Deactivated: "Your account has been deactivated. Contact an Admin.",
  SessionExpired: "Your session has ended. Please sign in again.",
  CredentialsSignin: "Invalid email or password, or password sign-in is not allowed for this account.",
  rate_limited: "Too many attempts. Please wait 15 minutes and try again.",
  AccessDenied: "Access denied.",
  Configuration: "Sign-in is misconfigured. Contact an Admin.",
};

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect(sp.callbackUrl?.startsWith("/") ? sp.callbackUrl : "/dashboard");
  const settings = await getSettings();
  const showPassword = settings.passwordLoginEnabled || process.env.DEMO_PASSWORD_LOGIN === "true";
  const callbackUrl = sp.callbackUrl?.startsWith("/") ? sp.callbackUrl : "/dashboard";
  const errorKey = sp.code === "rate_limited" ? "rate_limited" : sp.error;
  const error = errorKey ? (ERRORS[errorKey] ?? "Sign-in failed.") : null;

  async function microsoft() {
    "use server";
    await signIn("microsoft-entra-id", { redirectTo: callbackUrl });
  }
  async function password(formData: FormData) {
    "use server";
    try {
      await signIn("password", { email: formData.get("email"), password: formData.get("password"), redirectTo: callbackUrl });
    } catch (e) {
      if (e instanceof AuthError) {
        const code = (e as any).code === "rate_limited" ? "&code=rate_limited" : "";
        redirect(`/login?error=CredentialsSignin${code}&callbackUrl=${encodeURIComponent(callbackUrl)}`);
      }
      throw e;
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-stone-100 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-white p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <Logo className="text-xl" />
          <p className="text-sm text-muted-foreground">Sign in to the Citrineland CRM</p>
        </div>
        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {entraConfigured ? (
          <form action={microsoft}>
            <Button type="submit" className="w-full" size="lg">
              <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden>
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              Sign in with Microsoft
            </Button>
          </form>
        ) : (
          <p className="rounded-md bg-stone-50 p-3 text-center text-xs text-muted-foreground">Microsoft sign-in is not configured yet. See docs/MICROSOFT_SETUP.md.</p>
        )}
        {showPassword && (
          <>
            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-stone-200" /> Admin fallback <div className="h-px flex-1 bg-stone-200" />
            </div>
            <form action={password} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" autoComplete="username" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" name="password" type="password" autoComplete="current-password" required />
              </div>
              <Button type="submit" variant="outline" className="w-full">
                Sign in with password
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
