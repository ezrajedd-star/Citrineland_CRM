import { unsubscribeByToken } from "@/server/sequences";
import { Logo } from "@/components/app/logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe" };

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lead = await unsubscribeByToken(token);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-sm rounded-lg border bg-white p-6 text-center shadow-sm">
        <Logo />
        <p className="mt-4 text-sm">{lead ? "You've been unsubscribed. You won't receive further marketing emails from us." : "This unsubscribe link is invalid or has expired."}</p>
      </div>
    </main>
  );
}
