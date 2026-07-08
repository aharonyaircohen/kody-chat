/**
 * @fileType page
 * @domain kody
 * @pattern platform-admin-shell
 * @ai-summary Kody platform admin shell. This is the future home for
 *   tenant/platform management while `/` remains the current dashboard.
 */
import { AuthGuard } from "@dashboard/lib/auth-guard";
import { buildKodyMetadata } from "../metadata";

export const metadata = buildKodyMetadata({
  title: "Kody Platform",
  description: "Manage Kody platform tenants and global settings",
  path: "/kody",
});

export default function KodyPlatformPage() {
  return (
    <AuthGuard>
      <main className="flex min-h-0 flex-1 flex-col bg-background p-6 text-foreground">
        <div className="mx-auto w-full max-w-5xl">
          <h1 className="text-title-lg font-semibold">Kody platform</h1>
          <p className="mt-2 max-w-2xl text-body-sm text-muted-foreground">
            Platform admin shell for managing brands, routing, and global Kody
            settings. The current dashboard remains available at /.
          </p>
        </div>
      </main>
    </AuthGuard>
  );
}
