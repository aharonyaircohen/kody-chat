import { getServerProvider } from "@kody-ade/fly/infrastructure/installed";
import {
  resolveProviderContext,
  type InfrastructureServerOperations,
} from "@kody-ade/fly/infrastructure/server-operations";

export async function stopWorkflowRunner(req: Request, machineId: string): Promise<void> {
  const resolved = await resolveProviderContext(req as never);
  if (!resolved.ok) throw new Error(resolved.error);
  const operations = getServerProvider() as unknown as InfrastructureServerOperations;
  const cfg = operations.configFromContext(resolved.context);
  if (!cfg) throw new Error("Runner provider cannot stop workflows");
  const appName = process.env.FLY_APP_NAME ?? "kody-runner";
  await operations.stopMachine(appName, machineId, cfg);
}
