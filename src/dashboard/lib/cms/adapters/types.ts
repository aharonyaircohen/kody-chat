import type { NextRequest } from "next/server";

import type {
  CmsAdapterSettings,
  CmsCollectionConfig,
  CmsConfigState,
  CmsDocument,
  CmsListQuery,
  CmsListResult,
  CmsRuntimeConfig,
} from "../types";

export class CmsAdapterError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = "CmsAdapterError";
    this.code = code;
    this.status = status;
  }
}

export interface CmsAdapterContext {
  req: NextRequest;
  config: CmsRuntimeConfig;
  collection: CmsCollectionConfig;
  settings: CmsAdapterSettings;
  getSecret: (name: string) => Promise<string | null>;
}

export interface CmsAdapter {
  name: string;
  list: (context: CmsAdapterContext, query: CmsListQuery) => Promise<CmsListResult>;
  listByIds: (
    context: CmsAdapterContext,
    ids: string[],
  ) => Promise<CmsDocument[]>;
  get: (context: CmsAdapterContext, id: string) => Promise<CmsDocument | null>;
  create: (
    context: CmsAdapterContext,
    data: CmsDocument,
  ) => Promise<CmsDocument>;
  update: (
    context: CmsAdapterContext,
    id: string,
    data: CmsDocument,
  ) => Promise<CmsDocument | null>;
  delete: (context: CmsAdapterContext, id: string) => Promise<boolean>;
}

export interface CmsSetupFile {
  path: string;
  content: unknown;
}

export interface CmsSetupResult {
  cms: CmsConfigState;
  files: CmsSetupFile[];
  commitMessage: string;
}

export class CmsAdapterSetupError extends Error {
  readonly code: string;
  readonly status: number;
  readonly issues?: unknown;

  constructor(
    code: string,
    message: string,
    options?: { status?: number; issues?: unknown },
  ) {
    super(message);
    this.name = "CmsAdapterSetupError";
    this.code = code;
    this.status = options?.status ?? 400;
    this.issues = options?.issues;
  }
}

export interface CmsSetupAdapter {
  name: string;
  create: (payload: unknown) => CmsSetupResult;
}
