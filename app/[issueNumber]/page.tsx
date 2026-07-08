/**
 * @fileType page
 * @domain kody
 * @pattern dashboard-page
 * @ai-summary Kody dashboard with a specific task pre-selected via URL.
 *   The listed numeric params get prerendered at build time for OG tags;
 *   any other numeric issue renders on demand. We deliberately do NOT
 *   use `force-static` here — it caused Next.js to bake `/vibe` (and
 *   any other non-numeric sibling-route path) into a cached 307 redirect
 *   at the edge, silently shadowing the real static routes for ~5min
 *   stale-time windows. The runtime classifier keeps numeric segments as
 *   task pages, known brand slugs as client chat, and all other non-numeric
 *   segments as `notFound()` so sibling routes (vibe, capabilities, settings,
 *   …) win at routing.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { classifyRootSegment } from "@dashboard/lib/brand/routes";
import { BrandClientChat } from "@dashboard/lib/components/BrandClientChat";
import { KodyDashboard } from "@dashboard/lib/components/KodyDashboard";
import { buildTaskMetadata } from "../metadata";

// Do not guess issue numbers at build time. Numeric params render on demand.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ issueNumber: string }>;
}): Promise<Metadata> {
  const { issueNumber } = await params;
  const classified = classifyRootSegment(issueNumber);
  if (classified.kind === "task") {
    return buildTaskMetadata(classified.issueNumber);
  }
  if (classified.kind === "brand") {
    return {
      title: `${classified.brand.displayName} Chat`,
      description: classified.brand.tagline,
    };
  }
  return { title: "Kody Operations Dashboard" };
}

export default async function KodyTaskPage({
  params,
}: {
  params: Promise<{ issueNumber: string }>;
}) {
  const { issueNumber } = await params;
  // Numeric segments are task pages. Known non-numeric brand slugs render
  // client chat. Everything else must 404, not redirect — a cached
  // `force-static` redirect here shadows sibling static routes at the edge
  // and silently sends users to /.
  const classified = classifyRootSegment(issueNumber);
  if (classified.kind === "brand") {
    return <BrandClientChat brand={classified.brand} />;
  }

  if (classified.kind === "task") {
    return <KodyDashboard initialIssueNumber={classified.issueNumber} />;
  }

  notFound();
}
