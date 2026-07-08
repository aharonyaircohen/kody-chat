/**
 * @fileType page
 * @domain client-chat
 * @pattern client-chat-route
 * @ai-summary Brand-scoped client chat route. It renders a standalone shell
 *   around the real KodyChat and stays outside the dashboard chat rail.
 */
import type { Metadata } from "next";

import { ClientChatSurface } from "@dashboard/lib/components/ClientChatSurface";
import { getClientBrand } from "@dashboard/lib/client-brand";

interface ClientChatPageProps {
  params: Promise<{ brandSlug: string }>;
}

export async function generateMetadata({
  params,
}: ClientChatPageProps): Promise<Metadata> {
  const { brandSlug } = await params;
  const brand = getClientBrand(brandSlug);

  return {
    title: `${brand.name} Chat`,
    description: `Chat with ${brand.name}.`,
  };
}

export default async function ClientChatPage({ params }: ClientChatPageProps) {
  const { brandSlug } = await params;
  const brand = getClientBrand(brandSlug);

  return <ClientChatSurface brand={brand} />;
}
