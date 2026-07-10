/**
 * @fileType page
 * @domain client-chat
 * @pattern brands-page
 * @ai-summary Client brand registry entry point. Manages brand JSON files
 *   stored at `brands/<slug>.json` in the state repo.
 */
import { BrandsManager } from "@kody-ade/kody-chat/components/BrandsManager";
import { buildKodyMetadata } from "../../metadata";

export const dynamic = "force-dynamic";

export const metadata = buildKodyMetadata({
  title: "Brands — Kody Operations Dashboard",
  description: "Manage client chat brands.",
  path: "/brands",
});

export default function BrandsPage() {
  return <BrandsManager />;
}
