import { AuthGuard } from "@dashboard/lib/auth-guard";
import AppsPage from "@kody-ade/kody-chat-dashboard/pages/apps";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <AuthGuard>
      <AppsPage initialSlug={slug} />
    </AuthGuard>
  );
}
