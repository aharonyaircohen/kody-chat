import { FileSpacesManager } from "@dashboard/features/file-spaces/FileSpacesManager";
import { buildKodyMetadata } from "../../metadata";

export const metadata = buildKodyMetadata({
  title: "File spaces — Kody Operations Dashboard",
  description: "Manage focused repository file workspaces.",
  path: "/file-spaces",
});

export default function FileSpacesPage() {
  return <FileSpacesManager />;
}
