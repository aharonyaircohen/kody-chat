/** @pattern package-page-reexport */
import { buildKodyMetadata } from "../../metadata";

export const metadata = buildKodyMetadata({
  title: "Brain — Kody Operations Dashboard",
  description: "Manage your personal Brain chat models and runtimes.",
  path: "/brain",
});
export const dynamic = "force-static";
export const revalidate = false;
export const fetchCache = "force-cache";

export { default } from "@kody-ade/kody-chat/pages/brain";
