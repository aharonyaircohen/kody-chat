/**
 * @fileType util
 * @domain client-chat
 * @pattern languages-files
 * @ai-summary Read/write operator-managed client language JSON files under
 *   `languages/<code>.json` in the resolved Kody state repo. Packs override
 *   the built-in English strings on the /client chat surface; a brand's
 *   `locale` selects the pack.
 */

import type { Octokit } from "@octokit/rest";
import { z } from "zod";
import { getOctokit, getOwner, getRepo } from "../github-client";
import {
  deleteStateFile,
  listStateDirectory,
  readStateText,
  writeStateText,
} from "../state-repo";
import {
  isValidLanguageCode,
  normalizeClientLanguageCode,
  pickKnownLanguageStrings,
  type ClientLanguage,
} from "../client-language";

export interface LanguageFile extends ClientLanguage {
  source: "repo";
  sha: string;
  htmlUrl: string;
}

const LANGUAGES_DIR = "languages";
const LANGUAGE_CACHE_TTL_MS = 60_000;

const languageFileSchema = z.object({
  code: z.string().trim().min(2).max(35),
  name: z.string().trim().min(1).max(80),
  strings: z.record(z.string(), z.string().max(2000)).default({}),
});

type LanguageFileInput = z.infer<typeof languageFileSchema>;

interface CacheEntry<T> {
  data: T;
  expires: number;
  etag?: string;
}

const cache = new Map<string, CacheEntry<unknown>>();

function cacheEntry<T>(key: string): CacheEntry<T> | null {
  const entry = cache.get(key);
  return entry ? (entry as CacheEntry<T>) : null;
}

function cacheGet<T>(key: string): T | undefined {
  const entry = cacheEntry<T>(key);
  if (!entry || entry.expires <= Date.now()) return undefined;
  return entry.data as T;
}

function cacheSet<T>(key: string, data: T, etag?: string): void {
  cache.set(key, {
    data,
    expires: Date.now() + LANGUAGE_CACHE_TTL_MS,
    etag,
  });
}

function invalidateLocalLanguageCache(code?: string): void {
  if (code) {
    cache.delete(`language:${getOwner()}:${getRepo()}:${code}`);
  }
  cache.delete(`languages:${getOwner()}:${getRepo()}`);
}

function codeFromName(name: string): string | null {
  if (!name.endsWith(".json")) return null;
  const code = name.slice(0, -".json".length);
  return isValidLanguageCode(code) ? code : null;
}

function normalizeLanguageInput(
  input: LanguageFileInput,
  fallbackCode?: string,
): ClientLanguage {
  const code = normalizeClientLanguageCode(input.code || fallbackCode || "");
  if (!isValidLanguageCode(code)) {
    throw new Error(
      'Language code must be a BCP-47-style tag like "he" or "fr-ca".',
    );
  }
  return {
    code,
    name: input.name.trim(),
    strings: pickKnownLanguageStrings(input.strings),
  };
}

function parseLanguageJson(raw: string, fallbackCode: string): ClientLanguage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `Invalid language file "${fallbackCode}": JSON is malformed`,
    );
  }
  const result = languageFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid language file "${fallbackCode}": ${result.error.issues[0]?.message ?? "validation failed"}`,
    );
  }
  return normalizeLanguageInput(result.data, fallbackCode);
}

function languageFilePath(code: string): string {
  return `${LANGUAGES_DIR}/${code}.json`;
}

export async function listLanguageFiles(): Promise<LanguageFile[]> {
  const octokit = getOctokit();
  const cacheKey = `languages:${getOwner()}:${getRepo()}`;
  const cached = cacheGet<LanguageFile[]>(cacheKey);
  if (cached !== undefined) return cached;

  const stale = cacheEntry<LanguageFile[]>(cacheKey);
  try {
    const { entries, etag } = await listStateDirectory(
      octokit,
      getOwner(),
      getRepo(),
      LANGUAGES_DIR,
      stale?.etag ? { headers: { "If-None-Match": stale.etag } } : {},
    );
    const codes = entries
      .filter((entry) => entry.type === "file")
      .map((entry) => codeFromName(entry.name))
      .filter((code): code is string => Boolean(code));
    const files = await Promise.all(
      codes.map((code) => readLanguageFile(code)),
    );
    const languages = files
      .filter((file): file is LanguageFile => file !== null)
      .sort((a, b) => a.code.localeCompare(b.code));
    cacheSet(cacheKey, languages, etag);
    return languages;
  } catch (error: unknown) {
    if ((error as { status?: number })?.status === 304 && stale) {
      cacheSet(cacheKey, stale.data, stale.etag);
      return stale.data;
    }
    if ((error as { status?: number })?.status === 404) {
      cacheSet(cacheKey, []);
      return [];
    }
    throw error;
  }
}

export async function readLanguageFile(
  code: string,
  octokitOverride?: Octokit,
): Promise<LanguageFile | null> {
  const normalized = normalizeClientLanguageCode(code);
  if (!isValidLanguageCode(normalized)) return null;
  const cacheKey = `language:${getOwner()}:${getRepo()}:${normalized}`;
  const cached = cacheGet<LanguageFile | null>(cacheKey);
  if (cached !== undefined) return cached;

  const octokit = octokitOverride ?? getOctokit();
  const stale = cacheEntry<LanguageFile | null>(cacheKey);
  try {
    const file = await readStateText(
      octokit,
      getOwner(),
      getRepo(),
      languageFilePath(normalized),
      stale?.etag ? { headers: { "If-None-Match": stale.etag } } : {},
    );
    if (!file) {
      cacheSet(cacheKey, null);
      return null;
    }
    const language = parseLanguageJson(file.content, normalized);
    const resolved = {
      ...language,
      source: "repo" as const,
      sha: file.sha,
      htmlUrl: file.htmlUrl ?? "",
    };
    cacheSet(cacheKey, resolved, file.etag);
    return resolved;
  } catch (error: unknown) {
    if ((error as { status?: number })?.status === 404) {
      cacheSet(cacheKey, null);
      return null;
    }
    if ((error as { status?: number })?.status === 304 && stale) {
      cacheSet(cacheKey, stale.data, stale.etag);
      return stale.data;
    }
    throw error;
  }
}

export async function findLanguageFileFromList(
  code: string,
): Promise<LanguageFile | null> {
  const normalized = normalizeClientLanguageCode(code);
  if (!isValidLanguageCode(normalized)) return null;
  const languages = await listLanguageFiles();
  return languages.find((language) => language.code === normalized) ?? null;
}

export interface WriteLanguageOptions {
  octokit: Octokit;
  code: string;
  name: string;
  strings: Record<string, string>;
  sha?: string;
  message?: string;
}

export async function writeLanguageFile(
  opts: WriteLanguageOptions,
): Promise<LanguageFile> {
  const language = normalizeLanguageInput({
    code: opts.code,
    name: opts.name,
    strings: opts.strings,
  });
  await writeStateText({
    octokit: opts.octokit,
    owner: getOwner(),
    repo: getRepo(),
    path: languageFilePath(language.code),
    message:
      opts.message ??
      `${opts.sha ? "chore" : "feat"}(languages): ${opts.sha ? "update" : "add"} ${language.code}`,
    content: `${JSON.stringify(language, null, 2)}\n`,
    sha: opts.sha,
  });

  invalidateLocalLanguageCache(language.code);
  const refreshed = await readLanguageFile(language.code, opts.octokit);
  if (!refreshed) {
    throw new Error(
      "writeLanguageFile: file was written but could not be re-read",
    );
  }
  return refreshed;
}

export async function deleteLanguageFile(
  octokit: Octokit,
  code: string,
): Promise<void> {
  const existing = await readLanguageFile(code, octokit);
  if (!existing) return;
  await deleteStateFile({
    octokit,
    owner: getOwner(),
    repo: getRepo(),
    path: languageFilePath(existing.code),
    message: `chore(languages): remove ${existing.code}`,
    sha: existing.sha,
  });
  invalidateLocalLanguageCache(existing.code);
}
