/**
 * @fileType service
 * @domain brain
 * @pattern brain-image-apply
 *
 * Applies an explicit Brain image to the user's Fly Brain. This is separate
 * from terminal session start so connecting to a terminal never mutates Brain
 * infrastructure.
 */
import "server-only";

import {
  brainFlyRuntimeImageRef,
  brainGhcrAuth,
  prepareBrainRuntimeImage,
} from "./image-runtime";
import {
  brainImageCatalogFile,
  discoverBrainPackageImages,
  mergeBrainSavedImages,
} from "./image-catalog";
import { brainGhcrImageRef } from "./image-save";
import {
  readBrainApp,
  readBrainImage,
  writeBrainImage,
  writeBrainApp,
  type BrainImageFile,
} from "./store";
import { resolveBrainService } from "./service-resolver";
import {
  beginBrainRuntimeApply,
  completeBrainRuntimeApply,
  failBrainRuntimeApply,
} from "./runtime-manager";
import { readBrainRuntimeState } from "./runtime-store";
import type {
  BrainRuntimeRunning,
  BrainRuntimeStateFile,
} from "./runtime-store";
import { resolveBrainTarget } from "./target";
import { logger } from "@kody-ade/base/logger";
import {
  provisionServerBrain,
  waitForServerBrainHealth,
  type ServerBrainPerfTier,
  type ProvisionServerBrainResult,
} from "@kody-ade/fly/infrastructure/server-brain";
import type { EngineRuntimeModelConfig } from "@kody-ade/base/variables/models";

export interface ApplyBrainImageInput {
  owner: string;
  repo: string;
  account: string;
  githubAccount?: string;
  githubToken: string;
  allSecrets: Record<string, string>;
  flyToken: string;
  flyOrgSlug: string;
  flyDefaultRegion: string;
  dashboardUrl: string;
  engineModel?: string;
  engineModelConfig?: EngineRuntimeModelConfig;
  perfTier?: ServerBrainPerfTier;
  imageRef?: string;
  resetExistingMachine?: boolean;
  operationId?: string;
}

export interface ApplyBrainImageResult {
  image: BrainImageFile;
  brain: ProvisionServerBrainResult;
  runtime: BrainRuntimeStateFile;
}

async function recoverPreviousBrainRuntime(
  input: ApplyBrainImageInput,
  previous: BrainRuntimeRunning,
): Promise<BrainRuntimeRunning> {
  const stored = await readBrainApp(input.account, input.githubToken).catch(
    () => null,
  );
  const target = resolveBrainTarget({
    account: input.account,
    contextOrgSlug: input.flyOrgSlug,
    stored,
  });
  const service = await resolveBrainService({
    flyToken: input.flyToken,
    account: input.account,
    githubToken: input.githubToken,
    orgSlug: input.flyOrgSlug,
    defaultRegion: input.flyDefaultRegion,
    appNameOverride: target.app,
  });
  if (service.reason === "fly_access_denied") {
    throw new Error("Fly token cannot access this Brain app.");
  }
  const ghcr = brainGhcrAuth({
    allSecrets: input.allSecrets,
    githubToken: input.githubToken,
    account: input.githubAccount ?? input.account,
  });
  const brain = await provisionServerBrain({
    providerToken: service.flyToken,
    account: input.account,
    model: input.engineModel,
    modelConfig: input.engineModelConfig,
    githubToken: input.githubToken,
    allSecrets: input.allSecrets,
    perfTier: input.perfTier,
    orgSlug: service.orgSlug,
    defaultRegion: input.flyDefaultRegion,
    dashboardUrl: input.dashboardUrl,
    appNameOverride: service.app,
    imageRef: previous.imageRef,
    replaceExistingMachine: true,
    resolveRuntimeImageRef: ({ app, imageRef }) =>
      Promise.resolve(brainFlyRuntimeImageRef({ app, imageRef })),
    prepareRuntimeImage: async ({ app, sourceImageRef, runtimeImageRef }) => {
      await prepareBrainRuntimeImage({
        owner: input.account,
        repo: input.repo,
        app,
        imageRef: sourceImageRef,
        runtimeImageRef,
        flyToken: service.flyToken,
        ghcrToken: ghcr.token,
        ghcrUser: ghcr.user,
        orgSlug: service.orgSlug,
        defaultRegion: input.flyDefaultRegion,
      });
    },
  });
  await writeBrainApp(input.account, input.githubToken, {
    version: 1,
    appName: brain.app,
    orgSlug: brain.org,
    createdAt: new Date().toISOString(),
  });
  await waitForServerBrainHealth(brain.url, 120_000);
  return {
    imageRef: previous.imageRef,
    app: brain.app,
    machineId: brain.machineId,
    orgSlug: brain.org,
    url: brain.url,
    appliedAt: new Date().toISOString(),
  };
}

export async function applyBrainImageToRuntime(
  input: ApplyBrainImageInput,
): Promise<ApplyBrainImageResult> {
  let image = await readBrainImage(input.account, input.githubToken);
  const imageRef = input.imageRef?.trim();
  if (!imageRef) {
    throw new Error("Image ref is required");
  }
  const ghcr = brainGhcrAuth({
    allSecrets: input.allSecrets,
    githubToken: input.githubToken,
    account: input.githubAccount ?? input.account,
  });
  let savedImage = image?.images.find((saved) => saved.imageRef === imageRef);
  if (!savedImage) {
    const discoveredImages = await discoverBrainPackageImages({
      owner: input.owner,
      repo: input.repo,
      account: input.githubAccount ?? input.account,
      githubToken: ghcr.token,
    });
    const images = mergeBrainSavedImages(image, discoveredImages);
    savedImage = images.find((saved) => saved.imageRef === imageRef);
    if (savedImage) {
      const now = new Date().toISOString();
      image = brainImageCatalogFile({
        previous: image,
        createdAt: image?.createdAt ?? savedImage.createdAt,
        updatedAt: now,
        images,
      });
      await writeBrainImage(input.account, input.githubToken, image);
    }
  }
  if (!savedImage && input.githubAccount && isOwnedBrainImageRef(imageRef, input)) {
    savedImage = {
      imageRef,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  if (!savedImage) {
    throw new Error(
      image ? "Brain image is not saved" : "No Brain images saved",
    );
  }
  const catalogImage = image;
  if (!catalogImage) {
    throw new Error("No Brain images saved");
  }

  const started = input.operationId
    ? await readBrainRuntimeState(input.account, input.githubToken, true)
    : await beginBrainRuntimeApply(
        input.account,
        input.githubToken,
        imageRef,
      );
  if (
    !started?.operation ||
    (input.operationId && started.operation.id !== input.operationId)
  ) {
    throw Object.assign(new Error("Brain restore job is no longer current"), {
      status: 409,
      code: "brain_operation_conflict",
    });
  }

  try {
    const stored = await readBrainApp(input.account, input.githubToken).catch(
      () => null,
    );
    const target = resolveBrainTarget({
      account: input.account,
      contextOrgSlug: input.flyOrgSlug,
      stored,
    });
    const service = await resolveBrainService({
      flyToken: input.flyToken,
      account: input.account,
      githubToken: input.githubToken,
      orgSlug: input.flyOrgSlug,
      defaultRegion: input.flyDefaultRegion,
      appNameOverride: target.app,
    });
    if (service.reason === "fly_access_denied") {
      throw new Error("Fly token cannot access this Brain app.");
    }
    const operationFlyToken = service.flyToken;
    const operationOrgSlug = service.orgSlug;
    const brain = await provisionServerBrain({
      providerToken: operationFlyToken,
      account: input.account,
      model: input.engineModel,
      modelConfig: input.engineModelConfig,
      githubToken: input.githubToken,
      allSecrets: input.allSecrets,
      perfTier: input.perfTier,
      orgSlug: operationOrgSlug,
      defaultRegion: input.flyDefaultRegion,
      dashboardUrl: input.dashboardUrl,
      appNameOverride: service.app,
      imageRef,
      replaceExistingMachine: input.resetExistingMachine === true,
      resolveRuntimeImageRef: ({ app, imageRef }) =>
        Promise.resolve(brainFlyRuntimeImageRef({ app, imageRef })),
      prepareRuntimeImage: async ({ app, sourceImageRef, runtimeImageRef }) => {
        await prepareBrainRuntimeImage({
          owner: input.account,
          repo: input.repo,
          app,
          imageRef: sourceImageRef,
          runtimeImageRef,
          flyToken: operationFlyToken,
          ghcrToken: ghcr.token,
          ghcrUser: ghcr.user,
          orgSlug: operationOrgSlug,
          defaultRegion: input.flyDefaultRegion,
        });
      },
    });

    await writeBrainApp(input.account, input.githubToken, {
      version: 1,
      appName: brain.app,
      orgSlug: brain.org,
      createdAt: new Date().toISOString(),
    });

    await waitForServerBrainHealth(brain.url, 120_000);

    const runtime = await completeBrainRuntimeApply(
      input.account,
      input.githubToken,
      {
        operationId: started.operation!.id,
        imageRef,
        app: brain.app,
        machineId: brain.machineId,
        orgSlug: brain.org,
        url: brain.url,
      },
    );

    return { image: catalogImage, brain, runtime };
  } catch (err) {
    let recoveredRunning: BrainRuntimeRunning | undefined;
    if (started.running && started.running.imageRef !== imageRef) {
      try {
        recoveredRunning = await recoverPreviousBrainRuntime(
          input,
          started.running,
        );
      } catch (recoveryError) {
        logger.warn(
          {
            err: recoveryError,
            owner: input.owner,
            imageRef,
            previousImageRef: started.running.imageRef,
          },
          "brain image apply: previous runtime recovery failed",
        );
      }
    }
    const failureMessage = err instanceof Error ? err.message : String(err);
    const recordFailure = recoveredRunning
      ? failBrainRuntimeApply(
          input.account,
          input.githubToken,
          imageRef,
          failureMessage,
          started.operation!.id,
          recoveredRunning,
        )
      : failBrainRuntimeApply(
          input.account,
          input.githubToken,
          imageRef,
          failureMessage,
          started.operation!.id,
        );
    await recordFailure.catch((writeErr) => {
      logger.warn(
        { err: writeErr, owner: input.owner, imageRef },
        "brain image apply: failure state write failed",
      );
    });
    throw err;
  }
}

function isOwnedBrainImageRef(
  imageRef: string,
  input: Pick<ApplyBrainImageInput, "owner" | "githubAccount">,
): boolean {
  const prefix = brainGhcrImageRef({
    owner: input.owner,
    account: input.githubAccount!,
    tag: "probe",
  }).replace(/:probe$/, ":");
  return imageRef.startsWith(prefix);
}
