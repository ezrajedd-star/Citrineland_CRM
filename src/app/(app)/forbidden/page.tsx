import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function Forbidden({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p } = await searchParams;
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border bg-white p-6 text-center shadow-sm">
      <ShieldAlert className="mx-auto h-8 w-8 text-amber-600" />
      <h2 className="mt-2 text-lg font-semibold">You don't have access</h2>
      <p className="mt-2 text-sm text-muted-foreground">Your role doesn't include the permission needed for this page{p ? ` (${p})` : ""}. Ask an Admin if you need access.</p>
      <Button asChild className="mt-4">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
