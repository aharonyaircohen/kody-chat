/**
 * @fileType page
 * @domain kody
 * @pattern backend-page
 * @ai-summary Backend admin entry point — export state data as a JSON dump
 *   and import it into the Convex backend. Renders inside the shared
 *   PageWithChat shell so the assistant is always available.
 */
import { BackendManager } from "@dashboard/features/admin/components/BackendManager";
import { buildKodyMetadata } from "../../metadata";

export const dynamic = "force-static";
export const revalidate = false;
export const fetchCache = "force-cache";

export const metadata = buildKodyMetadata({
  title: "Backend — Kody Operations Dashboard",
  description:
    "Export the tenant's state data as a JSON dump and import it into the Convex backend.",
  path: "/backend",
});

export default function BackendPage() {
  return <BackendManager />;
}
