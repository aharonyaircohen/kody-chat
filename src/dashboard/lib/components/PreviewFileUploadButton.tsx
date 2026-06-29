/**
 * @fileType component
 * @domain preview
 * @pattern native-file-input-trigger
 * @ai-summary Reusable preview upload trigger where the native file input is
 *   the actual topmost click target, avoiding browser-specific label or
 *   programmatic-click behavior.
 */
"use client";

import type { ReactNode } from "react";

import { cn } from "../utils";

interface PreviewFileUploadButtonProps {
  "aria-label"?: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  title?: string;
}

export function PreviewFileUploadButton({
  "aria-label": ariaLabel = "Upload view files",
  children,
  className,
  disabled = false,
  multiple = true,
  onFiles,
  title,
}: PreviewFileUploadButtonProps) {
  return (
    <span
      title={title}
      className={cn(
        "relative inline-flex cursor-pointer overflow-hidden focus-within:ring-1 focus-within:ring-sky-400",
        disabled && "opacity-60",
        className,
      )}
    >
      <input
        type="file"
        multiple={multiple}
        aria-label={ariaLabel}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          if (files.length > 0) onFiles(files);
          event.currentTarget.value = "";
        }}
      />
      <span className="pointer-events-none inline-flex items-center gap-2">
        {children}
      </span>
    </span>
  );
}
