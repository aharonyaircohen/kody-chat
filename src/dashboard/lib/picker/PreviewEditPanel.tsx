"use client";

import { useState } from "react";
import {
  Copy,
  EyeOff,
  Image,
  Link,
  Paintbrush,
  RotateCcw,
  Send,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { cn } from "../utils";
import type { PickedElement, PreviewEditMutation } from "./protocol";

interface PreviewEditPanelProps {
  element: PickedElement;
  changeCount: number;
  busy: boolean;
  onApply: (mutation: PreviewEditMutation) => Promise<void>;
  onUndo: () => Promise<void>;
  onResetSelected: () => Promise<void>;
  onResetAll: () => Promise<void>;
  onAskKody: () => Promise<void>;
  onClose: () => void;
}

const inputClass =
  "h-8 rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100 outline-none focus:border-blue-500";
const actionClass =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded border border-zinc-700 bg-zinc-800 px-2.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50";
const controlLabelClass = "text-[11px] font-medium text-zinc-500";
const controlValueClass =
  "min-w-12 text-right font-mono text-[11px] text-zinc-400";

type StyleName =
  | "color"
  | "backgroundColor"
  | "fontSize"
  | "fontWeight"
  | "padding"
  | "margin"
  | "gap"
  | "border"
  | "borderRadius"
  | "boxShadow"
  | "width"
  | "maxWidth";

function firstPx(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match) return fallback;
  const next = Number(match[0]);
  return Number.isFinite(next) ? next : fallback;
}

function toPx(value: number): string {
  return `${Math.round(value)}px`;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function componentToHex(n: number): string {
  return clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
}

function colorToHex(value: string | undefined, fallback = "#000000"): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  const rgb = trimmed.match(
    /^rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)/i,
  );
  if (!rgb) return fallback;
  return `#${componentToHex(Number(rgb[1]))}${componentToHex(Number(rgb[2]))}${componentToHex(Number(rgb[3]))}`;
}

function normalizeFontWeight(value: string | undefined): string {
  const trimmed = (value ?? "").trim().toLowerCase();
  if (trimmed === "normal") return "400";
  if (trimmed === "bold") return "700";
  if (/^\d+$/.test(trimmed)) return trimmed;
  return "400";
}

function ColorControl({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  onChange: (value: string) => void;
}) {
  const hex = colorToHex(value, fallback);
  return (
    <label className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1.5">
      <span className={controlLabelClass}>{label}</span>
      <input
        type="color"
        value={hex}
        onChange={(event) => onChange(event.target.value)}
        className="ml-auto h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent p-0"
        aria-label={label}
      />
      <span className="w-16 font-mono text-[11px] text-zinc-400">{hex}</span>
    </label>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: string) => void;
}) {
  const numeric = clamp(firstPx(value, min), min, max);
  return (
    <label className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={controlLabelClass}>{label}</span>
        <span className={controlValueClass}>{toPx(numeric)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={numeric}
        onChange={(event) => onChange(toPx(Number(event.target.value)))}
        className="w-full accent-blue-500"
        aria-label={label}
      />
    </label>
  );
}

function SelectControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className={controlLabelClass}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="ml-auto h-8 rounded border border-zinc-700 bg-zinc-950 px-2 text-xs text-zinc-100 outline-none focus:border-blue-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function compactChangedStyles(
  styles: Record<string, string>,
  changed: Set<string>,
): PreviewEditMutation | null {
  const clean = Object.fromEntries(
    Object.entries(styles)
      .filter(([key]) => changed.has(key))
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value),
  );
  return Object.keys(clean).length ? { op: "style", styles: clean } : null;
}

export function PreviewEditPanel({
  element,
  changeCount,
  busy,
  onApply,
  onUndo,
  onResetSelected,
  onResetAll,
  onAskKody,
  onClose,
}: PreviewEditPanelProps) {
  const [textValue, setTextValue] = useState(element.text);
  const [hrefValue, setHrefValue] = useState(element.attributes.href ?? "");
  const [srcValue, setSrcValue] = useState(element.attributes.src ?? "");
  const [altValue, setAltValue] = useState(element.attributes.alt ?? "");
  const computedStyles = element.computedStyles ?? {};
  const [styles, setStyles] = useState({
    color: computedStyles.color ?? "",
    backgroundColor: computedStyles.backgroundColor ?? "",
    fontSize: computedStyles.fontSize ?? "",
    fontWeight: normalizeFontWeight(computedStyles.fontWeight),
    padding: computedStyles.padding ?? "",
    margin: computedStyles.margin ?? "",
    gap: computedStyles.gap ?? "",
    border: computedStyles.border ?? "",
    borderRadius: computedStyles.borderRadius ?? "",
    boxShadow: computedStyles.boxShadow ?? "",
    width: computedStyles.width ?? "",
    maxWidth: computedStyles.maxWidth ?? "",
  });
  const [changedStyles, setChangedStyles] = useState<Set<string>>(
    () => new Set(),
  );

  const updateStyle = (name: StyleName, value: string): void => {
    setStyles((prev) => ({ ...prev, [name]: value }));
    setChangedStyles((prev) => {
      const next = new Set(prev);
      next.add(name);
      return next;
    });
  };

  const applyStyles = async (): Promise<void> => {
    const mutation = compactChangedStyles(styles, changedStyles);
    if (!mutation) return;
    await onApply(mutation);
    setChangedStyles(new Set());
  };

  const hasHref = element.tagName === "a" || "href" in element.attributes;
  const hasSrc =
    element.tagName === "img" ||
    element.tagName === "source" ||
    "src" in element.attributes;

  return (
    <div className="max-h-[min(520px,calc(100vh-24px))] w-[320px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-md border border-zinc-700 bg-zinc-950 p-3 shadow-2xl">
      <div className="mb-3 flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-xs text-zinc-100">
            {element.selector}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-zinc-500">
            {element.tagName}
            {changeCount > 0
              ? ` · ${changeCount} edit${changeCount === 1 ? "" : "s"}`
              : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-white"
          title="Close editor"
          aria-label="Close editor"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            <Paintbrush className="h-3 w-3" />
            Style
          </div>
          <div className="space-y-3 rounded border border-zinc-800 bg-zinc-900/30 p-2.5">
            <div className="grid grid-cols-1 gap-2">
              <ColorControl
                label="Text"
                value={styles.color}
                fallback="#ffffff"
                onChange={(value) => updateStyle("color", value)}
              />
              <ColorControl
                label="Fill"
                value={styles.backgroundColor}
                fallback="#111827"
                onChange={(value) => updateStyle("backgroundColor", value)}
              />
            </div>

            <div className="space-y-2 border-t border-zinc-800 pt-2">
              <SliderControl
                label="Font size"
                value={styles.fontSize}
                min={8}
                max={96}
                onChange={(value) => updateStyle("fontSize", value)}
              />
              <SelectControl
                label="Weight"
                value={styles.fontWeight}
                onChange={(value) => updateStyle("fontWeight", value)}
                options={[
                  { label: "Thin", value: "100" },
                  { label: "Extra light", value: "200" },
                  { label: "Light", value: "300" },
                  { label: "Regular", value: "400" },
                  { label: "Medium", value: "500" },
                  { label: "Semibold", value: "600" },
                  { label: "Bold", value: "700" },
                  { label: "Extra bold", value: "800" },
                  { label: "Black", value: "900" },
                ]}
              />
            </div>

            <div className="space-y-2 border-t border-zinc-800 pt-2">
              <SliderControl
                label="Padding"
                value={styles.padding}
                min={0}
                max={96}
                onChange={(value) => updateStyle("padding", value)}
              />
              <SliderControl
                label="Margin"
                value={styles.margin}
                min={0}
                max={96}
                onChange={(value) => updateStyle("margin", value)}
              />
              <SliderControl
                label="Gap"
                value={styles.gap}
                min={0}
                max={80}
                onChange={(value) => updateStyle("gap", value)}
              />
            </div>

            <div className="space-y-2 border-t border-zinc-800 pt-2">
              <SliderControl
                label="Radius"
                value={styles.borderRadius}
                min={0}
                max={64}
                onChange={(value) => updateStyle("borderRadius", value)}
              />
              <SliderControl
                label="Width"
                value={styles.width}
                min={0}
                max={1200}
                step={10}
                onChange={(value) => updateStyle("width", value)}
              />
              <SliderControl
                label="Max width"
                value={styles.maxWidth}
                min={0}
                max={1200}
                step={10}
                onChange={(value) => updateStyle("maxWidth", value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-2 border-t border-zinc-800 pt-2">
              <input
                value={styles.border}
                onChange={(event) => updateStyle("border", event.target.value)}
                placeholder="border, e.g. 1px solid #ddd"
                className={inputClass}
              />
              <input
                value={styles.boxShadow}
                onChange={(event) =>
                  updateStyle("boxShadow", event.target.value)
                }
                placeholder="shadow"
                className={inputClass}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void applyStyles()}
            disabled={busy || changedStyles.size === 0}
            className={cn(actionClass, "w-full")}
          >
            <Paintbrush className="h-3.5 w-3.5" />
            Apply style
          </button>
        </section>

        <section className="space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            <Type className="h-3 w-3" />
            Content
          </div>
          <div className="flex gap-2">
            <input
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              placeholder="text"
              className={cn(inputClass, "min-w-0 flex-1")}
            />
            <button
              type="button"
              onClick={() => void onApply({ op: "text", value: textValue })}
              disabled={busy}
              className={actionClass}
            >
              <Type className="h-3.5 w-3.5" />
            </button>
          </div>

          {hasHref && (
            <div className="flex gap-2">
              <input
                value={hrefValue}
                onChange={(event) => setHrefValue(event.target.value)}
                placeholder="href"
                className={cn(inputClass, "min-w-0 flex-1")}
              />
              <button
                type="button"
                onClick={() =>
                  void onApply({
                    op: "attribute",
                    name: "href",
                    value: hrefValue,
                  })
                }
                disabled={busy}
                className={actionClass}
              >
                <Link className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {hasSrc && (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <input
                value={srcValue}
                onChange={(event) => setSrcValue(event.target.value)}
                placeholder="src"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() =>
                  void onApply({
                    op: "attribute",
                    name: "src",
                    value: srcValue,
                  })
                }
                disabled={busy}
                className={actionClass}
              >
                <Image className="h-3.5 w-3.5" />
              </button>
              <input
                value={altValue}
                onChange={(event) => setAltValue(event.target.value)}
                placeholder="alt"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() =>
                  void onApply({
                    op: "attribute",
                    name: "alt",
                    value: altValue,
                  })
                }
                disabled={busy}
                className={actionClass}
              >
                <Image className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </section>

        <section className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => void onApply({ op: "hide" })}
            disabled={busy}
            className={actionClass}
          >
            <EyeOff className="h-3.5 w-3.5" />
            Hide
          </button>
          <button
            type="button"
            onClick={() => void onApply({ op: "duplicate" })}
            disabled={busy}
            className={actionClass}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>
          <button
            type="button"
            onClick={() => void onApply({ op: "remove" })}
            disabled={busy}
            className={actionClass}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        </section>

        <div className="grid grid-cols-3 gap-2 border-t border-zinc-800 pt-3">
          <button
            type="button"
            onClick={() => void onUndo()}
            disabled={busy || changeCount === 0}
            className={actionClass}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </button>
          <button
            type="button"
            onClick={() => void onResetSelected()}
            disabled={busy || changeCount === 0}
            className={actionClass}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={() => void onResetAll()}
            disabled={busy || changeCount === 0}
            className={actionClass}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            All
          </button>
        </div>

        <button
          type="button"
          onClick={() => void onAskKody()}
          disabled={busy || changeCount === 0}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          Ask Kody to apply
        </button>
      </div>
    </div>
  );
}
