/**
 * @fileType page
 * @domain kody-chat
 * @pattern shared-page
 * @ai-summary Canonical Settings page — hosts serve it as a one-line
 *   re-export (see pages-coverage specs in each host).
 */
import { SettingsManager } from "../components/SettingsManager";

export default function SettingsPage() {
  return <SettingsManager />;
}
