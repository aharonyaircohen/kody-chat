/**
 * @fileType use-case
 * @domain brain
 * @pattern brain-image-apply-command
 *
 * Command boundary for restoring/applying a saved Brain image.
 */
import "server-only";

import type { ServerProviderContext } from "@dashboard/lib/infrastructure/server-context";

import {
  applySelectedBrainImage,
  type ApplyBrainImageResult,
} from "./image-apply";

export interface ApplyBrainImageCommandInput {
  context: ServerProviderContext;
  dashboardUrl: string;
  imageRef?: string;
  reset?: boolean;
}

export async function applyBrainImage(
  input: ApplyBrainImageCommandInput,
): Promise<ApplyBrainImageResult> {
  const { context } = input;
  if (!context.flyToken) {
    throw new Error(
      "Brain image apply needs a Fly Machines token. Add FLY_API_TOKEN to the repo Secrets vault.",
    );
  }
  return applySelectedBrainImage({
    owner: context.owner,
    repo: context.repo,
    account: context.account,
    githubToken: context.githubToken,
    allSecrets: context.allSecrets,
    flyToken: context.flyToken,
    flyOrgSlug: context.flyOrgSlug,
    flyDefaultRegion: context.flyDefaultRegion,
    dashboardUrl: input.dashboardUrl,
    engineModel: context.engineModel,
    engineModelConfig: context.engineModelConfig,
    perfTier: context.perfTier,
    imageRef: input.imageRef,
    resetExistingMachine: input.reset === true,
  });
}
