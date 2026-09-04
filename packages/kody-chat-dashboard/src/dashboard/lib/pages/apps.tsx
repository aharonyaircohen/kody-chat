import { AppsManager } from "../components/AppsManager";
export default function AppsPage({ initialSlug }: { initialSlug?: string }) {
  return <AppsManager initialSlug={initialSlug} />;
}
