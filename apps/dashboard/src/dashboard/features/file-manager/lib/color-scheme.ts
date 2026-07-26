"use client";

import { useSyncExternalStore } from "react";

export type FileManagerColorScheme = "light" | "dark";

function currentColorScheme(): FileManagerColorScheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function subscribe(onChange: () => void): () => void {
  if (typeof document === "undefined") return () => undefined;
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

/** Reads the host document's standard light/dark class without host coupling. */
export function useFileManagerColorScheme(): FileManagerColorScheme {
  return useSyncExternalStore(subscribe, currentColorScheme, () => "light");
}
