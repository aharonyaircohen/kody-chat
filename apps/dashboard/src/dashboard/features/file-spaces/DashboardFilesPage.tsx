"use client";

import { useCallback, useMemo } from "react";
import { Octokit } from "@octokit/rest";
import { useSearchParams } from "next/navigation";

import {
  FilesPage,
  type FilesPageProps,
  type FilesTransport,
} from "@dashboard/features/file-manager";
import { createGitHubFilesTransport } from "@dashboard/features/file-manager/lib/github-files-transport";
import { useAuth } from "@dashboard/lib/auth-context";
import { useRepoScopedHref } from "@dashboard/lib/hooks/useRepoScopedHref";
import { Button } from "@kody-ade/base/ui/button";
import {
  buildGuidedFlowFilePickerHref,
  fileMatchesPicker,
  parseGuidedFlowFilePicker,
  storeGuidedFlowFileSelection,
} from "@kody-ade/kody-chat-dashboard/guided-flows/file-picker";

export type DashboardFilesPageProps = Omit<
  FilesPageProps,
  "resolveHref" | "subtitle" | "transport"
> & {
  transport?: FilesTransport;
  subtitle?: string;
};

/**
 * Dashboard-owned composition for the standalone File Manager.
 * Authentication, repository selection, and route scoping stop here.
 */
export function DashboardFilesPage({
  transport,
  subtitle,
  headerActions,
  ...props
}: DashboardFilesPageProps) {
  const { auth } = useAuth();
  const searchParams = useSearchParams();
  const filePicker = useMemo(
    () => parseGuidedFlowFilePicker(searchParams),
    [searchParams],
  );
  const resolveHref = useRepoScopedHref();
  const resolveFileHref = useCallback(
    (href: string) =>
      resolveHref(
        decodeURI(
          filePicker ? buildGuidedFlowFilePickerHref(href, filePicker) : href,
        ),
      ),
    [filePicker, resolveHref],
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
      headerActions={(context) => (
        <>
          {headerActions?.(context)}
          {filePicker ? (
            <Button
              size="sm"
              disabled={
                !context.isFile ||
                !context.selectedPath ||
                !fileMatchesPicker(context.selectedPath, filePicker)
              }
              onClick={() => {
                if (!context.selectedPath) return;
                storeGuidedFlowFileSelection(window.sessionStorage, {
                  ...filePicker,
                  filePath: context.selectedPath,
                  fileName:
                    context.selectedPath.split("/").pop() ??
                    context.selectedPath,
                });
                window.history.back();
              }}
            >
              Use this file
            </Button>
          ) : null}
        </>
      )}
      subtitle={
        subtitle ?? (auth ? `${auth.owner}/${auth.repo}` : "Your files")
      }
    />
  );
}
