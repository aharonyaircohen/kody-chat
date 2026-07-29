import { buildKodyMetadata } from "../../metadata";

export const metadata = buildKodyMetadata({
  title: "Chat Tools — Kody Operations Dashboard",
  description: "Manage workflow-published tools available to Kody Chat.",
  path: "/chat-tools",
});
export const dynamic = "force-dynamic";

export { default } from "@kody-ade/kody-chat-dashboard/pages/chat-tools";
