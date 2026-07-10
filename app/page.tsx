/**
 * @fileType page
 * @domain kody-chat
 * @pattern redirect
 * @ai-summary Root page — sends visitors to the default brand's chat surface
 */
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/client/kody");
}
