/**
 * @fileType component
 * @domain files
 * @pattern files-page
 * @ai-summary Main orchestrator for the /files page. Combines FileTree,
 *   FileViewer, FileEditor, FileSearch, UploadZone, and FileContextMenu into
 *   a responsive split-pane layout with breadcrumb navigation.
 */
"use client";

import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type DragEvent,
} from "react";
import { Octokit } from "@octokit/rest";
import { useRouter } from "next/navigation";
import {
  Copy,
  Download,
  ExternalLink,
  FilePlus,
  FolderPlus,
  FolderOpen,
  Search,
  Upload,
  ChevronRight,
  PanelLeft,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@dashboard/lib/utils";
import { useAuth } from "@dashboard/lib/auth-context";
import {
  listDir,
  readFile,
  writeFile,
  deleteFile,
  uploadFile,
  type FileContent,
  type FileEntry,
  getHttpStatus,
} from "@dashboard/lib/repo-files";
import { useRepoScopedHref } from "@dashboard/lib/hooks/useRepoScopedHref";
import { FileTree, type FileTreeOverlay } from "./FileTree";
import { FileViewer } from "./FileViewer";
import { FileEditor } from "./FileEditor";
import type { FileEditorViewMode } from "./FileEditor";
import { FileDiffViewer } from "./FileDiffViewer";
import { FileSearch } from "./FileSearch";
import { UploadZone } from "./UploadZone";
import { PageShell } from "@dashboard/lib/components/PageShell";
import { Button } from "@kody-ade/base/ui/button";
import { Input } from "@kody-ade/base/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@kody-ade/base/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kody-ade/base/ui/dropdown-menu";

type ViewMode = "viewer" | "editor" | "diff" | "search" | "upload";
type PanelState = "tree" | "split" | "hidden";

interface SelectedFile {
  path: string;
  sha: string;
}

type RepoPathType = "file" | "dir" | "symlink";

interface BreadcrumbItem {
  path: string;
  label: string;
}

/**
 * Build a breadcrumb trail from a file path.
 * E.g. "src/components/Button.tsx" → [
 *   { path: "src", label: "src" },
 *   { path: "src/components", label: "components" },
 *   { path: "src/components/Button.tsx", label: "Button.tsx" },
 * ]
 */
export function buildBreadcrumbs(path: string): BreadcrumbItem[] {
  if (!path) return [];
  const parts = path.split("/");
  const items: BreadcrumbItem[] = [];
  let acc = "";
  for (const part of parts) {
    acc += acc ? `/${part}` : part;
    items.push({ path: acc, label: part });
  }
  return items;
}

export function normalizeRepoPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

export function parentRepoPath(path: string | null | undefined): string {
  const normalized = normalizeRepoPath(path ?? "");
  if (!normalized.includes("/")) return "";
  return normalized.slice(0, normalized.lastIndexOf("/"));
}

export function currentFolderPath(
  path: string | null | undefined,
  pathType: "file" | "dir" | null,
): string {
  if (pathType === "dir") return normalizeRepoPath(path ?? "");
  if (pathType === "file") return parentRepoPath(path);
  return "";
}

export function joinRepoPath(base: string, child: string): string {
  return normalizeRepoPath(
    [normalizeRepoPath(base), normalizeRepoPath(child)]
      .filter(Boolean)
      .join("/"),
  );
}

export function replacePathPrefix(
  path: string,
  oldPrefix: string,
  newPrefix: string,
): string {
  const normalizedPath = normalizeRepoPath(path);
  const normalizedOld = normalizeRepoPath(oldPrefix);
  const normalizedNew = normalizeRepoPath(newPrefix);
  if (normalizedPath === normalizedOld) return normalizedNew;
  if (!normalizedPath.startsWith(`${normalizedOld}/`)) return normalizedPath;
  return joinRepoPath(
    normalizedNew,
    normalizedPath.slice(normalizedOld.length),
  );
}

export function isExpectedDeletedPath(
  path: string,
  deletedPaths: ReadonlySet<string>,
): boolean {
  const normalizedPath = normalizeRepoPath(path);
  return [...deletedPaths].some(
    (deletedPath) =>
      normalizedPath === deletedPath ||
      normalizedPath.startsWith(`${deletedPath}/`),
  );
}

export function shouldShowWorkspaceLocation(
  selectedPathType: RepoPathType | null,
  viewMode: ViewMode,
): boolean {
  return (
    selectedPathType !== "file" || !["viewer", "editor"].includes(viewMode)
  );
}

export function duplicatePath(path: string, pathType: RepoPathType): string {
  const normalized = normalizeRepoPath(path);
  const parent = parentRepoPath(normalized);
  const name = normalized.split("/").pop() ?? normalized;
  if (pathType === "dir") return joinRepoPath(parent, `${name}-copy`);

  const dot = name.lastIndexOf(".");
  const copyName =
    dot > 0 ? `${name.slice(0, dot)} copy${name.slice(dot)}` : `${name} copy`;
  return joinRepoPath(parent, copyName);
}

export function githubFileUrl(
  owner: string,
  repo: string,
  path: string,
  pathType: RepoPathType | null,
): string {
  const normalized = normalizeRepoPath(path);
  const view = pathType === "dir" ? "tree" : "blob";
  const suffix = normalized
    ? `/${normalized.split("/").map(encodeURIComponent).join("/")}`
    : "";
  return `https://github.com/${owner}/${repo}/${view}/HEAD${suffix}`;
}

export function buildFileHref(path: string | null | undefined): string {
  const normalized = normalizeRepoPath(path ?? "");
  if (!normalized) return "/files";
  return `/files/${normalized.split("/").map(encodeURIComponent).join("/")}`;
}

export function filePathFromHref(pathname: string): string {
  if (pathname === "/files") return "";
  if (!pathname.startsWith("/files/")) return "";
  return normalizeRepoPath(
    pathname
      .slice("/files/".length)
      .split("/")
      .map((part) => {
        try {
          return decodeURIComponent(part);
        } catch {
          return part;
        }
      })
      .join("/"),
  );
}

function emptyTreeOverlay(): FileTreeOverlay {
  return { upserts: {}, deletes: {}, version: 0 };
}

function treeEntryForPath(
  path: string,
  type: RepoPathType,
  options: { sha?: string; size?: number } = {},
): FileEntry {
  const normalized = normalizeRepoPath(path);
  return {
    name: normalized.split("/").pop() ?? normalized,
    path: normalized,
    type,
    size: options.size ?? 0,
    sha: options.sha ?? "",
  };
}

interface FilesPageProps {
  initialPath?: string;
  title?: string;
  rootPath?: string;
  routeBase?: string;
  pinnedEntries?: FileEntry[];
  protectedPaths?: string[];
  entryFilter?: (entry: FileEntry) => boolean;
  newFileExtension?: string;
  newFilePlaceholder?: string;
  newFileNameOnly?: boolean;
  showSearch?: boolean;
  showUpload?: boolean;
  defaultMarkdownViewMode?: FileEditorViewMode;
}

export function FilesPage({
  initialPath = "",
  title = "Files",
  rootPath = "",
  routeBase = "/files",
  pinnedEntries = [],
  protectedPaths = [],
  entryFilter,
  newFileExtension = "",
  newFilePlaceholder = "filename.txt or nested/path.txt",
  newFileNameOnly = false,
  showSearch = true,
  showUpload = true,
  defaultMarkdownViewMode = "edit",
}: FilesPageProps) {
  const { auth } = useAuth();
  const router = useRouter();
  const scopedHref = useRepoScopedHref();
  const octokit = useMemo(
    () => (auth?.token ? new Octokit({ auth: auth.token }) : null),
    [auth?.token],
  );

  const initialRepoPath = useMemo(
    () => normalizeRepoPath(initialPath),
    [initialPath],
  );
  const workspaceRoot = useMemo(() => normalizeRepoPath(rootPath), [rootPath]);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(
    initialRepoPath || null,
  );
  const [viewMode, setViewMode] = useState<ViewMode>("viewer");
  const [panelState, setPanelState] = useState<PanelState>("split");
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newItemPath, setNewItemPath] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{
    path: string;
    pathType: RepoPathType;
  } | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    path: string;
    pathType: RepoPathType;
  } | null>(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [treeOverlay, setTreeOverlay] =
    useState<FileTreeOverlay>(emptyTreeOverlay);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const openRequestRef = useRef(0);
  const openedInitialPathRef = useRef<string | null>(null);
  const dragDepthRef = useRef(0);
  const deletedPathsRef = useRef<Set<string>>(new Set());

  // GitHub remains the authority for each write. Permission metadata is not
  // consistently present for every token type, so it must not hide controls.
  const writeable = Boolean(octokit && auth);

  useEffect(() => {
    setTreeOverlay(emptyTreeOverlay());
  }, [auth?.owner, auth?.repo]);

  // Build breadcrumbs from selected file path
  const breadcrumbs = useMemo<BreadcrumbItem[]>(
    () => (selectedPath ? buildBreadcrumbs(selectedPath) : []),
    [selectedPath],
  );

  const selectedPathType: RepoPathType | null = selectedFile
    ? "file"
    : selectedPath
      ? "dir"
      : null;
  const isSelectedProtected = Boolean(
    selectedPath &&
    protectedPaths
      .map(normalizeRepoPath)
      .includes(normalizeRepoPath(selectedPath)),
  );

  const currentFolder = useMemo(() => {
    const selectedFolder = currentFolderPath(selectedPath, selectedPathType);
    return selectedFolder === workspaceRoot ||
      selectedFolder.startsWith(`${workspaceRoot}/`)
      ? selectedFolder
      : workspaceRoot;
  }, [selectedPath, selectedPathType, workspaceRoot]);

  const updateFileHref = useCallback(
    (path: string, options: { replace?: boolean } = {}) => {
      const normalizedPath = normalizeRepoPath(path);
      const relativePath =
        workspaceRoot && normalizedPath.startsWith(`${workspaceRoot}/`)
          ? normalizedPath.slice(workspaceRoot.length + 1)
          : normalizedPath;
      const workspaceHref = relativePath
        ? `${routeBase}/${relativePath
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`
        : routeBase;
      const href = scopedHref(workspaceHref);
      if (typeof window !== "undefined" && window.location.pathname === href) {
        return;
      }

      if (options.replace) {
        router.replace(href);
      } else {
        router.push(href);
      }
    },
    [routeBase, router, scopedHref, workspaceRoot],
  );

  const openRepoPath = useCallback(
    async (
      path: string,
      options: {
        updateRoute?: boolean;
        replace?: boolean;
        typeHint?: "file" | "dir";
      } = {},
    ) => {
      const normalizedPath = normalizeRepoPath(path);
      const updateRoute = options.updateRoute ?? true;
      const requestId = ++openRequestRef.current;

      if (!normalizedPath) {
        setSelectedPath(null);
        setSelectedFile(null);
        setViewMode("viewer");
        if (updateRoute) updateFileHref("", { replace: options.replace });
        return;
      }

      setSelectedPath(normalizedPath);
      if (options.typeHint === "dir") {
        setSelectedFile(null);
        setViewMode("viewer");
      }
      if (updateRoute) {
        updateFileHref(normalizedPath, { replace: options.replace });
      }

      if (!octokit || !auth) return;

      try {
        const file = await readFile(
          octokit,
          auth.owner,
          auth.repo,
          normalizedPath,
        );
        if (requestId !== openRequestRef.current) return;

        if (file) {
          setSelectedPath(file.path);
          setSelectedFile({ path: file.path, sha: file.sha });
          setViewMode(writeable ? "editor" : "viewer");
          return;
        }

        await listDir(octokit, auth.owner, auth.repo, normalizedPath);
        if (requestId !== openRequestRef.current) return;
        setSelectedFile(null);
        setViewMode("viewer");
      } catch (err) {
        if (
          getHttpStatus(err) === 404 &&
          isExpectedDeletedPath(normalizedPath, deletedPathsRef.current)
        ) {
          if (requestId !== openRequestRef.current) return;
          setSelectedPath(null);
          setSelectedFile(null);
          setViewMode("viewer");
          return;
        }
        toast.error(err instanceof Error ? err.message : "Failed to open file");
        if (requestId !== openRequestRef.current) return;
        setSelectedPath(null);
        setSelectedFile(null);
        setViewMode("viewer");
      }
    },
    [octokit, auth, updateFileHref, writeable],
  );

  useEffect(() => {
    if (!octokit || !auth) return;
    const initialOpenKey = `${auth.owner}/${auth.repo}:${initialRepoPath}`;

    if (!initialRepoPath) {
      openedInitialPathRef.current = initialOpenKey;
      setSelectedPath(null);
      setSelectedFile(null);
      setViewMode("viewer");
      return;
    }

    if (openedInitialPathRef.current === initialOpenKey) return;
    openedInitialPathRef.current = initialOpenKey;
    void openRepoPath(initialRepoPath, { updateRoute: false });
  }, [auth, initialRepoPath, octokit, openRepoPath]);

  useEffect(() => {
    if (writeable && selectedFile && viewMode === "viewer") {
      setViewMode("editor");
    }
  }, [selectedFile, viewMode, writeable]);

  useEffect(() => {
    const handlePopState = () => {
      const routeMarker = `${routeBase}/`;
      const markerIndex = window.location.pathname.lastIndexOf(routeMarker);
      const routePath =
        markerIndex >= 0
          ? normalizeRepoPath(
              window.location.pathname.slice(markerIndex + routeMarker.length),
            )
          : "";
      const repoPath =
        routePath === "README.md"
          ? routePath
          : joinRepoPath(workspaceRoot, routePath);
      void openRepoPath(repoPath, {
        updateRoute: false,
      });
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [openRepoPath, routeBase, workspaceRoot]);

  const handleViewDiff = useCallback(() => {
    setViewMode("diff");
  }, []);

  const handleSaved = useCallback(() => {
    // Refresh the file content
    if (selectedFile) {
      openRepoPath(selectedFile.path, { updateRoute: false });
    }
  }, [selectedFile, openRepoPath]);

  const handleCancel = useCallback(() => {
    setViewMode("viewer");
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const upsertTreeEntry = useCallback((entry: FileEntry) => {
    const normalizedPath = normalizeRepoPath(entry.path);
    const normalizedEntry: FileEntry = {
      ...entry,
      path: normalizedPath,
      name: entry.name || (normalizedPath.split("/").pop() ?? normalizedPath),
    };

    setTreeOverlay((prev) => {
      const deletes = { ...prev.deletes };
      delete deletes[normalizedPath];
      return {
        upserts: { ...prev.upserts, [normalizedPath]: normalizedEntry },
        deletes,
        version: prev.version + 1,
      };
    });
  }, []);

  const removeTreePath = useCallback((path: string) => {
    const normalizedPath = normalizeRepoPath(path);
    setTreeOverlay((prev) => {
      const upserts = Object.fromEntries(
        Object.entries(prev.upserts).filter(
          ([entryPath]) =>
            entryPath !== normalizedPath &&
            !entryPath.startsWith(`${normalizedPath}/`),
        ),
      );

      return {
        upserts,
        deletes: { ...prev.deletes, [normalizedPath]: true },
        version: prev.version + 1,
      };
    });
  }, []);

  const collectFiles = useCallback(
    async function collect(
      path: string,
      pathType: RepoPathType,
    ): Promise<FileContent[]> {
      if (!octokit || !auth) return [];

      if (pathType !== "dir") {
        const file = await readFile(octokit, auth.owner, auth.repo, path);
        if (!file) throw new Error(`File not found: ${path}`);
        return [file];
      }

      const entries = await listDir(octokit, auth.owner, auth.repo, path);
      const files: FileContent[] = [];
      for (const entry of entries) {
        if (entry.type === "dir") {
          files.push(...(await collect(entry.path, "dir")));
        } else if (entry.type === "file") {
          const file = await readFile(
            octokit,
            auth.owner,
            auth.repo,
            entry.path,
          );
          if (file) files.push(file);
        }
      }
      return files;
    },
    [octokit, auth],
  );

  const handleUploadFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!octokit || !auth) {
        toast.error("Not authenticated");
        return;
      }

      const uploadList = Array.from(files).filter((file) => file.name);
      if (uploadList.length === 0) return;

      let uploaded = 0;
      for (const file of uploadList) {
        const destPath = joinRepoPath(currentFolder, file.name);
        try {
          const result = await uploadFile(
            octokit,
            auth.owner,
            auth.repo,
            destPath,
            file,
            `chore: upload ${destPath}`,
          );
          upsertTreeEntry(
            treeEntryForPath(destPath, "file", {
              sha: result.sha,
              size: file.size,
            }),
          );
          uploaded += 1;
        } catch (err) {
          toast.error(
            err instanceof Error
              ? `Failed to upload ${file.name}: ${err.message}`
              : `Failed to upload ${file.name}`,
          );
        }
      }

      if (uploaded > 0) {
        const folderLabel = currentFolder ? `/${currentFolder}` : "/";
        toast.success(
          `Uploaded ${uploaded} ${uploaded === 1 ? "file" : "files"} to ${folderLabel}`,
        );
        handleRefresh();
      }
    },
    [octokit, auth, currentFolder, handleRefresh, upsertTreeEntry],
  );

  const isFileDrag = (e: DragEvent) =>
    Array.from(e.dataTransfer.types).includes("Files");

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      if (!writeable || !showUpload || !isFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current += 1;
      setIsDraggingFiles(true);
    },
    [showUpload, writeable],
  );

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      if (!writeable || !showUpload || !isFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      setIsDraggingFiles(true);
    },
    [showUpload, writeable],
  );

  const handleDragLeave = useCallback(
    (e: DragEvent) => {
      if (!writeable || !showUpload || !isFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDraggingFiles(false);
    },
    [showUpload, writeable],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      if (!writeable || !showUpload || !isFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setIsDraggingFiles(false);
      void handleUploadFiles(e.dataTransfer.files);
    },
    [handleUploadFiles, showUpload, writeable],
  );

  const handleNewFile = useCallback((dirPath: string) => {
    setNewItemPath(normalizeRepoPath(dirPath));
    setShowNewFileDialog(true);
  }, []);

  const handleNewFolder = useCallback((dirPath: string) => {
    setNewItemPath(normalizeRepoPath(dirPath));
    setShowNewFolderDialog(true);
  }, []);

  const handleCreateFile = useCallback(
    async (name: string) => {
      if (!octokit || !auth) return;
      const trimmedName = name.trim();
      if (
        newFileNameOnly &&
        (trimmedName.includes("/") || trimmedName.includes("\\"))
      ) {
        toast.error("Enter a file name without folders");
        return;
      }
      const fileName =
        newFileExtension &&
        !trimmedName.toLowerCase().endsWith(newFileExtension.toLowerCase())
          ? `${trimmedName}${newFileExtension}`
          : trimmedName;
      const path = joinRepoPath(newItemPath || workspaceRoot, fileName);
      if (!path) return;
      try {
        const result = await writeFile(
          octokit,
          auth.owner,
          auth.repo,
          path,
          "",
          `chore: create ${path}`,
        );
        upsertTreeEntry(treeEntryForPath(path, "file", { sha: result.sha }));
        deletedPathsRef.current.delete(path);
        toast.success(`Created ${path}`);
        setShowNewFileDialog(false);
        setNewItemPath("");
        setSelectedPath(path);
        setSelectedFile({ path, sha: result.sha });
        setViewMode(writeable ? "editor" : "viewer");
        updateFileHref(path);
        handleRefresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to create file",
        );
      }
    },
    [
      octokit,
      auth,
      newItemPath,
      upsertTreeEntry,
      writeable,
      updateFileHref,
      handleRefresh,
      newFileExtension,
      newFileNameOnly,
      workspaceRoot,
    ],
  );

  const handleCreateFolder = useCallback(
    async (name: string) => {
      if (!octokit || !auth) return;
      // Creating an "empty" directory via Contents API isn't directly supported,
      // but we can create a .gitkeep file inside it as a workaround
      const folderPath = joinRepoPath(newItemPath, name);
      if (!folderPath) return;
      const gitkeepPath = `${folderPath}/.gitkeep`;
      try {
        const result = await writeFile(
          octokit,
          auth.owner,
          auth.repo,
          gitkeepPath,
          "",
          `chore: create ${folderPath}/`,
        );
        upsertTreeEntry(treeEntryForPath(folderPath, "dir"));
        upsertTreeEntry(
          treeEntryForPath(gitkeepPath, "file", { sha: result.sha }),
        );
        deletedPathsRef.current.delete(folderPath);
        toast.success(`Created ${folderPath}/`);
        setShowNewFolderDialog(false);
        setNewItemPath("");
        setSelectedPath(folderPath);
        setSelectedFile(null);
        setViewMode("viewer");
        updateFileHref(folderPath);
        handleRefresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to create folder",
        );
      }
    },
    [
      octokit,
      auth,
      newItemPath,
      upsertTreeEntry,
      updateFileHref,
      handleRefresh,
    ],
  );

  const handleDelete = useCallback(
    async (path: string, pathType: RepoPathType) => {
      if (!octokit || !auth) return;
      setShowDeleteConfirm({ path, pathType });
    },
    [octokit, auth],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!octokit || !auth || !showDeleteConfirm) return;
    const { path, pathType } = showDeleteConfirm;
    setBusyAction("Deleting...");
    try {
      let files: FileContent[] = [];
      try {
        files = await collectFiles(path, pathType);
      } catch (err) {
        if (
          getHttpStatus(err) !== 404 &&
          !(err instanceof Error && err.message.startsWith("File not found:"))
        ) {
          throw err;
        }
      }
      for (const file of files.reverse()) {
        try {
          await deleteFile(
            octokit,
            auth.owner,
            auth.repo,
            file.path,
            file.sha,
            `chore: delete ${path}`,
          );
        } catch (err) {
          if (getHttpStatus(err) !== 404) throw err;
        }
      }
      toast.success(`Deleted ${path}`);
      deletedPathsRef.current.add(normalizeRepoPath(path));
      openRequestRef.current += 1;
      removeTreePath(path);
      if (selectedPath === path || selectedPath?.startsWith(`${path}/`)) {
        setSelectedFile(null);
        setSelectedPath(null);
        setViewMode("viewer");
        updateFileHref("");
      }
      handleRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setShowDeleteConfirm(null);
      setBusyAction(null);
    }
  }, [
    octokit,
    auth,
    showDeleteConfirm,
    selectedPath,
    updateFileHref,
    handleRefresh,
    collectFiles,
    removeTreePath,
  ]);

  const handleCreateSymlink = useCallback(
    async (_targetPath: string) => {
      if (!octokit || !auth) return;
      // This would show a dialog for symlink creation
      // Simplified for now
      toast.info("Symlink creation: provide target path and symlink name");
    },
    [octokit, auth],
  );

  const handleRename = useCallback((path: string, pathType: RepoPathType) => {
    setPendingMove({ path, pathType });
    setMoveTarget(path);
  }, []);

  const moveRepoPath = useCallback(
    async (sourcePath: string, pathType: RepoPathType, targetPath: string) => {
      if (!octokit || !auth) return false;
      const target = normalizeRepoPath(targetPath);
      const source = normalizeRepoPath(sourcePath);
      if (!target || target === source) return false;
      if (pathType === "dir" && target.startsWith(`${source}/`)) {
        toast.error("Choose a folder outside the current folder");
        return false;
      }

      const files = await collectFiles(source, pathType);
      if (files.length === 0) {
        toast.error("Nothing to move");
        return false;
      }

      let targetSha = "";
      if (pathType === "dir") {
        upsertTreeEntry(treeEntryForPath(target, "dir"));
      }

      for (const file of files) {
        const nextPath =
          pathType === "dir"
            ? replacePathPrefix(file.path, source, target)
            : target;
        const result = await writeFile(
          octokit,
          auth.owner,
          auth.repo,
          nextPath,
          file.content,
          `chore: move ${source} to ${target}`,
        );
        targetSha = result.sha;
        upsertTreeEntry(
          treeEntryForPath(nextPath, "file", {
            sha: result.sha,
            size: file.size,
          }),
        );
      }

      for (const file of [...files].reverse()) {
        await deleteFile(
          octokit,
          auth.owner,
          auth.repo,
          file.path,
          file.sha,
          `chore: remove moved ${source}`,
        );
      }

      removeTreePath(source);
      toast.success(`Moved ${source} to ${target}`);
      setSelectedPath(target);
      if (pathType === "dir") {
        setSelectedFile(null);
        setViewMode("viewer");
      } else {
        setSelectedFile({ path: target, sha: targetSha });
        setViewMode(writeable ? "editor" : "viewer");
      }
      updateFileHref(target);
      handleRefresh();
      return true;
    },
    [
      octokit,
      auth,
      collectFiles,
      upsertTreeEntry,
      removeTreePath,
      writeable,
      updateFileHref,
      handleRefresh,
    ],
  );

  const handleConfirmMove = useCallback(async () => {
    if (!pendingMove) return;
    const target = normalizeRepoPath(moveTarget);
    const source = normalizeRepoPath(pendingMove.path);
    if (!target || target === source) return;
    if (pendingMove.pathType === "dir" && target.startsWith(`${source}/`)) {
      toast.error("Choose a folder outside the current folder");
      return;
    }

    setBusyAction("Moving...");
    try {
      const moved = await moveRepoPath(source, pendingMove.pathType, target);
      if (moved) {
        setPendingMove(null);
        setMoveTarget("");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to move");
    } finally {
      setBusyAction(null);
    }
  }, [pendingMove, moveTarget, moveRepoPath]);

  const handleMoveToFolder = useCallback(
    async (path: string, pathType: RepoPathType, targetDir: string) => {
      const source = normalizeRepoPath(path);
      const name = source.split("/").pop();
      if (!name) return;
      const target = joinRepoPath(targetDir, name);
      if (!target || target === source) return;

      setBusyAction("Moving...");
      try {
        await moveRepoPath(source, pathType, target);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to move");
      } finally {
        setBusyAction(null);
      }
    },
    [moveRepoPath],
  );

  const handleDuplicate = useCallback(
    async (path: string, pathType: RepoPathType) => {
      if (!octokit || !auth) return;
      const source = normalizeRepoPath(path);
      const target = duplicatePath(source, pathType);
      setBusyAction("Duplicating...");
      try {
        const files = await collectFiles(source, pathType);
        if (files.length === 0) {
          toast.error("Nothing to duplicate");
          return;
        }
        if (pathType === "dir") {
          upsertTreeEntry(treeEntryForPath(target, "dir"));
        }
        for (const file of files) {
          const nextPath =
            pathType === "dir"
              ? replacePathPrefix(file.path, source, target)
              : target;
          const result = await writeFile(
            octokit,
            auth.owner,
            auth.repo,
            nextPath,
            file.content,
            `chore: duplicate ${source}`,
          );
          upsertTreeEntry(
            treeEntryForPath(nextPath, "file", {
              sha: result.sha,
              size: file.size,
            }),
          );
        }
        toast.success(`Duplicated to ${target}`);
        handleRefresh();
        await openRepoPath(target, {
          typeHint: pathType === "dir" ? "dir" : "file",
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to duplicate");
      } finally {
        setBusyAction(null);
      }
    },
    [octokit, auth, collectFiles, upsertTreeEntry, handleRefresh, openRepoPath],
  );

  const handleDownload = useCallback(
    async (path: string, pathType: RepoPathType) => {
      if (!octokit || !auth || pathType !== "file") return;
      try {
        const res = await octokit.rest.repos.getContent({
          owner: auth.owner,
          repo: auth.repo,
          path,
        });
        const data = res.data;
        if (Array.isArray(data) || data.type !== "file") {
          throw new Error("File not found");
        }
        const content = (data.content ?? "").replace(/\s/g, "");
        const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes]));
        const a = document.createElement("a");
        a.href = url;
        a.download = path.split("/").pop() ?? "download";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to download");
      }
    },
    [octokit, auth],
  );

  const handleOpenOnGitHub = useCallback(
    (path: string, pathType: RepoPathType) => {
      if (!auth) return;
      window.open(
        githubFileUrl(auth.owner, auth.repo, path, pathType),
        "_blank",
        "noopener,noreferrer",
      );
    },
    [auth],
  );

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path).then(() => {
      toast.success("Path copied to clipboard");
    });
  }, []);

  const handleSearchResultClick = useCallback(
    (path: string, _line?: number) => {
      openRepoPath(path, { typeHint: "file" });
    },
    [openRepoPath],
  );

  const renderMainContent = () => {
    if (viewMode === "search") {
      return (
        <FileSearch
          octokit={octokit}
          owner={auth?.owner ?? ""}
          repo={auth?.repo ?? ""}
          onResultClick={handleSearchResultClick}
          onClose={() => setViewMode(selectedFile ? "viewer" : "search")}
        />
      );
    }

    if (viewMode === "upload") {
      return (
        <UploadZone
          octokit={octokit}
          owner={auth?.owner ?? ""}
          repo={auth?.repo ?? ""}
          onUploadComplete={(uploaded) => {
            upsertTreeEntry(
              treeEntryForPath(uploaded.path, "file", {
                sha: uploaded.sha,
                size: uploaded.size,
              }),
            );
            handleRefresh();
          }}
          destinationDir={currentFolder}
        />
      );
    }

    if (viewMode === "diff" && selectedFile) {
      return (
        <FileDiffViewer
          path={selectedFile.path}
          octokit={octokit}
          owner={auth?.owner ?? ""}
          repo={auth?.repo ?? ""}
          onClose={() => setViewMode("viewer")}
        />
      );
    }

    if (viewMode === "editor" && selectedFile) {
      return (
        <FileEditor
          path={selectedFile.path}
          sha={selectedFile.sha}
          octokit={octokit}
          owner={auth?.owner ?? ""}
          repo={auth?.repo ?? ""}
          onCancel={handleCancel}
          onSaved={handleSaved}
          defaultMarkdownViewMode={defaultMarkdownViewMode}
        />
      );
    }

    if (selectedFile) {
      return (
        <FileViewer
          path={selectedFile.path}
          sha={selectedFile.sha}
          octokit={octokit}
          owner={auth?.owner ?? ""}
          repo={auth?.repo ?? ""}
          onViewDiff={handleViewDiff}
        />
      );
    }

    if (selectedPath) {
      if (selectedPathType === "dir") {
        const folderName = selectedPath.split("/").pop() ?? selectedPath;
        return (
          <div className="flex h-full items-center justify-center p-8">
            <div className="w-full max-w-xl rounded-3xl border border-border bg-card p-8">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-primary/15 bg-primary/10">
                <FolderOpen className="h-7 w-7 text-primary" />
              </div>
              <p className="mt-6 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Current space
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                {folderName}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Choose an item from the tree, create something new, or drag
                files between folders to reorganize them.
              </p>
              {writeable ? (
                <div className="mt-6 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => handleNewFile(selectedPath)}
                    className="gap-2"
                  >
                    <FilePlus className="h-4 w-4" />
                    New file
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleNewFolder(selectedPath)}
                    className="gap-2"
                  >
                    <FolderPlus className="h-4 w-4" />
                    New folder
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        );
      }
      return (
        <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
          <FolderOpen className="w-12 h-12 mb-4" />
          <p className="text-base">/{selectedPath}</p>
        </div>
      );
    }

    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="w-full max-w-xl rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-primary/15 bg-primary/10">
            <FolderOpen className="h-7 w-7 text-primary" />
          </div>
          <p className="mt-6 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Repository workspace
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Choose what you want to work on
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Browse the repository tree, open a file, or create something new.
            Drag items between folders to reorganize them.
          </p>
          {writeable ? (
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => handleNewFile(currentFolder)}
                className="gap-2"
              >
                <FilePlus className="h-4 w-4" />
                New file
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleNewFolder(currentFolder)}
                className="gap-2"
              >
                <FolderPlus className="h-4 w-4" />
                New folder
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const actions = (
    <div className="flex items-center gap-2.5">
      {writeable && (
        <Button
          size="sm"
          onClick={() => handleNewFile(currentFolder)}
          className="gap-2"
        >
          <FilePlus className="h-4 w-4" />
          <span className="hidden sm:inline">New file</span>
        </Button>
      )}

      {writeable && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleNewFolder(currentFolder)}
          className="gap-2"
        >
          <FolderPlus className="h-4 w-4" />
          <span className="hidden sm:inline">New folder</span>
        </Button>
      )}

      {showSearch || selectedPath || (writeable && showUpload) ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              title="More file actions"
              aria-label="More file actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {showSearch ? (
              <DropdownMenuItem onClick={() => setViewMode("search")}>
                <Search className="h-4 w-4" />
                Search
              </DropdownMenuItem>
            ) : null}
            {selectedPath && selectedPathType ? (
              <DropdownMenuItem
                onClick={() =>
                  handleOpenOnGitHub(selectedPath, selectedPathType)
                }
              >
                <ExternalLink className="h-4 w-4" />
                Open on GitHub
              </DropdownMenuItem>
            ) : null}
            {selectedFile ? (
              <DropdownMenuItem
                onClick={() => handleDownload(selectedFile.path, "file")}
              >
                <Download className="h-4 w-4" />
                Download
              </DropdownMenuItem>
            ) : null}
            {writeable &&
            selectedPath &&
            selectedPathType &&
            !isSelectedProtected ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleRename(selectedPath, selectedPathType)}
                >
                  <Pencil className="h-4 w-4" />
                  Rename or move
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    handleDuplicate(selectedPath, selectedPathType)
                  }
                >
                  <Copy className="h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-300 focus:text-red-200"
                  onClick={() => handleDelete(selectedPath, selectedPathType)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </>
            ) : null}
            {writeable && showUpload ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setViewMode("upload")}>
                  <Upload className="h-4 w-4" />
                  Upload
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );

  return (
    <PageShell
      title={title}
      titleContent={
        <div className="min-w-0">
          <p className="text-[0.68rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Repository workspace
          </p>
          <h1 className="truncate text-heading-md font-semibold tracking-tight md:text-heading-lg">
            {title}
          </h1>
        </div>
      }
      subtitle={
        auth ? `${auth.owner}/${auth.repo}` : "Browse and edit repository files"
      }
      backHref={null}
      actions={actions}
      width="full"
      contentClassName="p-0"
    >
      <div
        className="relative flex h-full"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Left panel - file tree */}
        {panelState !== "hidden" && (
          <div
            className={cn(
              "h-full shrink-0 border-r border-border bg-card/30",
              panelState === "split" ? "w-80 xl:w-[22rem]" : "w-full",
            )}
          >
            {panelState === "split" ? (
              <FileTree
                onFileSelect={(path) =>
                  openRepoPath(path, { typeHint: "file" })
                }
                onFolderSelect={(path) =>
                  openRepoPath(path, { typeHint: "dir" })
                }
                selectedPath={selectedPath}
                selectedPathType={selectedPathType}
                octokit={octokit}
                owner={auth?.owner ?? ""}
                repo={auth?.repo ?? ""}
                refreshKey={refreshKey}
                onRefresh={handleRefresh}
                onDelete={writeable ? handleDelete : undefined}
                onRename={writeable ? handleRename : undefined}
                onDuplicate={writeable ? handleDuplicate : undefined}
                onDownload={handleDownload}
                onOpenOnGitHub={handleOpenOnGitHub}
                onNewFile={writeable ? handleNewFile : undefined}
                onNewFolder={writeable ? handleNewFolder : undefined}
                onCopyPath={handleCopyPath}
                onCreateSymlink={writeable ? handleCreateSymlink : undefined}
                onMove={writeable ? handleMoveToFolder : undefined}
                onCollapse={() => setPanelState("hidden")}
                treeOverlay={treeOverlay}
                rootPath={workspaceRoot}
                pinnedEntries={pinnedEntries}
                protectedPaths={protectedPaths}
                entryFilter={entryFilter}
                variant="focused"
              />
            ) : null}
          </div>
        )}

        {/* Right panel - content */}
        <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
          {/* Breadcrumb */}
          {shouldShowWorkspaceLocation(selectedPathType, viewMode) ? (
            <div className="flex min-h-14 shrink-0 items-center gap-1 border-b border-border px-5">
              {panelState === "hidden" && (
                <button
                  className="mr-2 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setPanelState("split")}
                  title="Show file panel"
                  aria-label="Show file panel"
                >
                  <PanelLeft className="w-4 h-4" />
                </button>
              )}
              <button
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => void openRepoPath("")}
                title="Open workspace root"
              >
                <FolderOpen className="h-4 w-4 text-primary" />
                {workspaceRoot || "Repository"}
              </button>
              {breadcrumbs.map((crumb, i) => (
                <div key={crumb.path} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <button
                    className={cn(
                      "max-w-[160px] truncate text-sm hover:text-foreground",
                      i === breadcrumbs.length - 1
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                    onClick={() => void openRepoPath(crumb.path)}
                  >
                    {crumb.label}
                  </button>
                </div>
              ))}
              <span className="ml-auto rounded-full border border-border bg-muted px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {selectedPathType === "file"
                  ? "File"
                  : selectedPathType === "dir"
                    ? "Folder"
                    : "Workspace"}
              </span>
            </div>
          ) : null}

          {/* Main content area */}
          <div className="flex-1 min-h-0">{renderMainContent()}</div>
        </div>

        {writeable && isDraggingFiles ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="rounded-lg border-2 border-dashed border-emerald-400/60 bg-emerald-500/10 px-8 py-6 text-center">
              <Upload className="mx-auto mb-3 h-8 w-8 text-emerald-300" />
              <p className="text-sm font-medium text-foreground">
                Drop files to upload
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {currentFolder ? `/${currentFolder}` : "/"}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* New file dialog */}
      {showNewFileDialog && (
        <Dialog
          open
          onOpenChange={(open) => !open && setShowNewFileDialog(false)}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New file</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const input = form.elements.namedItem(
                  "filename",
                ) as HTMLInputElement;
                if (input?.value?.trim()) {
                  handleCreateFile(input.value.trim());
                }
              }}
              className="space-y-4"
            >
              <p className="text-xs text-muted-foreground">
                Creates in {newItemPath ? `/${newItemPath}` : "/"}.
              </p>
              <Input
                name="filename"
                placeholder={newFilePlaceholder}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowNewFileDialog(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Create</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* New folder dialog */}
      {showNewFolderDialog && (
        <Dialog
          open
          onOpenChange={(open) => !open && setShowNewFolderDialog(false)}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New folder</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const input = form.elements.namedItem(
                  "foldername",
                ) as HTMLInputElement;
                if (input?.value?.trim()) {
                  handleCreateFolder(input.value.trim());
                }
              }}
              className="space-y-4"
            >
              <p className="text-xs text-muted-foreground">
                Creates in {newItemPath ? `/${newItemPath}` : "/"}.
              </p>
              <Input
                name="foldername"
                placeholder="folder-name or nested/path"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowNewFolderDialog(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Create</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Rename / move dialog */}
      {pendingMove && (
        <Dialog open onOpenChange={(open) => !open && setPendingMove(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Rename or move</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleConfirmMove();
              }}
              className="space-y-4"
            >
              <p className="text-xs text-muted-foreground">
                Enter the full new repository path.
              </p>
              <Input
                value={moveTarget}
                onChange={(e) => setMoveTarget(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPendingMove(null)}
                  disabled={busyAction !== null}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busyAction !== null}>
                  {busyAction ?? "Move"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <Dialog
          open
          onOpenChange={(open) => !open && setShowDeleteConfirm(null)}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                Delete{" "}
                {showDeleteConfirm.pathType === "dir" ? "folder" : "file"}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Delete{" "}
              <code className="text-foreground">{showDeleteConfirm.path}</code>?
              This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowDeleteConfirm(null)}
                disabled={busyAction !== null}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={busyAction !== null}
              >
                {busyAction ?? "Delete"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  );
}
