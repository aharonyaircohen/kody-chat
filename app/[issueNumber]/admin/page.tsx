/**
 * @fileType page
 * @domain brand
 * @pattern brand-operator-shell
 * @ai-summary Brand operator shell at /:brand/admin. The dynamic folder keeps
 *   compatibility with the existing root task route; only known brand slugs
 *   render here.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AuthGuard } from "@dashboard/lib/auth-guard";
import { classifyRootSegment } from "@dashboard/lib/brand/routes";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ issueNumber: string }>;
}): Promise<Metadata> {
  const { issueNumber } = await params;
  const classified = classifyRootSegment(issueNumber);
  if (classified.kind !== "brand") return { title: "Kody Operations Dashboard" };
  return {
    title: `${classified.brand.displayName} Admin`,
    description: `Operator dashboard for ${classified.brand.displayName}`,
  };
}

export default async function BrandAdminPage({
  params,
}: {
  params: Promise<{ issueNumber: string }>;
}) {
  const { issueNumber } = await params;
  const classified = classifyRootSegment(issueNumber);
  if (classified.kind !== "brand") notFound();

  return (
    <AuthGuard>
      <main className="flex min-h-0 flex-1 flex-col bg-background p-6 text-foreground">
        <div className="mx-auto w-full max-w-5xl">
          <h1 className="text-title-lg font-semibold">
            {classified.brand.displayName} admin
          </h1>
          <p className="mt-2 max-w-2xl text-body-sm text-muted-foreground">
            Brand operator shell for configuring the client chat experience.
          </p>
        </div>
      </main>
    </AuthGuard>
  );
}
