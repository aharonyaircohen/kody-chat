"use client";

import { useCallback, useMemo } from "react";
import { Octokit } from "@octokit/rest";

import {
  FilesPage,
  type FilesPageProps,
  type FilesTransport,
} from "@dashboard/features/file-manager";
import { createGitHubFilesTransport } from "@dashboard/features/file-manager/lib/github-files-transport";
import { useAuth } from "@dashboard/lib/auth-context";
import { useRepoScopedHref } from "@dashboard/lib/hooks/useRepoScopedHref";

export type DashboardFilesPageProps = Omit<
  FilesPageProps,
  "resolveHref" | "subtitle" | "transport"
> & {
  transport?: FilesTransport;
};

/**
 * Dashboard-owned composition for the standalone File Manager.
 * Authentication, repository selection, and route scoping stop here.
 */
export function DashboardFilesPage({
  transport,
  ...props
}: DashboardFilesPageProps) {
  const { auth } = useAuth();
  const resolveHref = useRepoScopedHref();
  const resolveFileHref = useCallback(
    (href: string) => resolveHref(decodeURI(href)),
    [resolveHref],
  );
  const githubTransport = useMemo(() => {
    if (transport || !auth?.token) return null;
    return createGitHubFilesTransport(
      new Octokit({ auth: auth.token }),
      auth.owner,
      auth.repo,
    );
  }, [auth?.owner, auth?.repo, auth?.token, transport]);

  return (
    <FilesPage
      {...props}
      transport={transport ?? githubTransport}
      resolveHref={resolveFileHref}
      subtitle={
        auth ? `${auth.owner}/${auth.repo}` : "Browse and edit repository files"
      }
    />
  );
}
