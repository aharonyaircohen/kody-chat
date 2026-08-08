/** Register Dashboard-owned Markdown guides before the package chat route loads. */
import { join } from "node:path";

import { getFeatureGuideRegistry } from "@kody-ade/kody-chat-dashboard/platform/server-feature-guides";
import { createFileFeatureGuideProvider } from "@dashboard/lib/feature-guides/server";

const DASHBOARD_GUIDE_PROVIDER_ID = "dashboard-host";
const registry = getFeatureGuideRegistry();

if (!registry.providerIds().includes(DASHBOARD_GUIDE_PROVIDER_ID)) {
  registry.register(
    DASHBOARD_GUIDE_PROVIDER_ID,
    createFileFeatureGuideProvider({
      rootDirectory: join(process.cwd(), "src/dashboard/features"),
    }),
  );
}
