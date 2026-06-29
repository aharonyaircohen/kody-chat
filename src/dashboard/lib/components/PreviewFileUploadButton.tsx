/**
 * @fileType component
 * @domain preview
 * @pattern native-file-input
 * @ai-summary Reusable preview upload control. Renders a real visible file
 *   input so the browser owns opening the file chooser directly.
 */
"use client";

import type { ChangeEvent, ReactNode } from "react";

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
  const handleInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.currentTarget.files ?? []);
    if (files.length > 0) onFiles(files);
    event.currentTarget.value = "";
  };

  return (
    <label
      title={title}
      className={cn(
        "inline-flex min-w-0 cursor-pointer items-center gap-2 focus-within:outline-none focus-within:ring-1 focus-within:ring-sky-400",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <span className="inline-flex shrink-0 items-center gap-2">{children}</span>
      <input
        type="file"
        multiple={multiple}
        aria-label={ariaLabel}
        className="min-w-0 max-w-[11rem] cursor-pointer text-[11px] text-zinc-600 file:mr-2 file:cursor-pointer file:rounded file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-[11px] file:font-medium file:text-white hover:file:bg-zinc-700 disabled:cursor-not-allowed disabled:file:cursor-not-allowed"
        disabled={disabled}
        onChange={handleInputChange}
      />
    </label>
  );
}
