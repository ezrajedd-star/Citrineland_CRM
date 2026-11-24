import Link from "next/link";
import { requireUser } from "@/lib/session";
import { globalSearch } from "@/server/queries/search";
import { PageHeader, EmptyState } from "@/components/app/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q = "" } = await searchParams;
  const hits = await globalSearch(user, q);
  return (
    <>
      <PageHeader title={`Search: “${q}”`} description={`${hits.length} result(s)`} />
      <Card>
        {hits.length === 0 ? (
          <EmptyState title="No matches" description="Search by name, unit or transaction code, email, or mobile number." />
        ) : (
          <ul className="divide-y">
            {hits.map((h) => (
              <li key={h.kind + h.id}>
                <Link href={h.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50">
                  <Badge variant="secondary" className="w-24 justify-center">
                    {h.kind}
                  </Badge>
                  <span className="font-medium text-stone-900">{h.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{h.subtitle}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
