import type { CmsFilterOperator, CmsSortEntry } from "@dashboard/lib/cms/types";

export interface CmsListFilterValue {
  operator: CmsFilterOperator;
  value: string | string[];
}

export type CmsListFilterValues = Record<string, CmsListFilterValue>;

export interface CmsListState {
  collectionSearch: string;
  filterValues: CmsListFilterValues;
  sort: CmsSortEntry[];
  offset: number;
}

const COLLECTION_SEARCH_PARAM = "collectionSearch";
const FILTERS_PARAM = "filters";
const SORT_PARAM = "sort";
const OFFSET_PARAM = "offset";

const CMS_FILTER_OPERATORS = new Set<string>([
  "equals",
  "not_equals",
  "contains",
  "in",
  "exists",
  "greater_than",
  "greater_than_equal",
  "less_than",
  "less_than_equal",
]);

export function parseCmsListState(
  params: Pick<URLSearchParams, "get">,
): CmsListState {
  return {
    collectionSearch: params.get(COLLECTION_SEARCH_PARAM) ?? "",
    filterValues: parseFilterValues(params.get(FILTERS_PARAM)),
    sort: parseSort(params.get(SORT_PARAM)),
    offset: parseOffset(params.get(OFFSET_PARAM)),
  };
}

export function serializeCmsListState(
  currentParams: URLSearchParams,
  state: CmsListState,
): URLSearchParams {
  const next = new URLSearchParams(currentParams);
  const filterValues = normalizeFilterValues(state.filterValues);
  const sort = normalizeSort(state.sort);

  if (state.collectionSearch.trim()) {
    next.set(COLLECTION_SEARCH_PARAM, state.collectionSearch);
  } else {
    next.delete(COLLECTION_SEARCH_PARAM);
  }

  if (Object.keys(filterValues).length > 0) {
    next.set(FILTERS_PARAM, JSON.stringify(filterValues));
  } else {
    next.delete(FILTERS_PARAM);
  }

  if (sort.length > 0) {
    next.set(SORT_PARAM, JSON.stringify(sort));
  } else {
    next.delete(SORT_PARAM);
  }

  if (Number.isInteger(state.offset) && state.offset > 0) {
    next.set(OFFSET_PARAM, String(state.offset));
  } else {
    next.delete(OFFSET_PARAM);
  }

  return next;
}

function parseFilterValues(raw: string | null): CmsListFilterValues {
  if (!raw) return {};
  const parsed = parseJson(raw);
  if (!isRecord(parsed)) return {};
  return normalizeFilterValues(parsed);
}

function normalizeFilterValues(value: unknown): CmsListFilterValues {
  if (!isRecord(value)) return {};

  const result: CmsListFilterValues = {};
  for (const [field, filterValue] of Object.entries(value)) {
    if (!field || !isRecord(filterValue)) continue;
    const operator = filterValue.operator;
    const filterInput = filterValue.value;

    if (typeof operator !== "string" || !CMS_FILTER_OPERATORS.has(operator)) {
      continue;
    }
    if (!isFilterInput(filterInput) || isBlankFilterInput(filterInput)) {
      continue;
    }

    result[field] = {
      operator: operator as CmsFilterOperator,
      value: filterInput,
    };
  }
  return result;
}

function parseSort(raw: string | null): CmsSortEntry[] {
  if (!raw) return [];
  return normalizeSort(parseJson(raw));
}

function normalizeSort(value: unknown): CmsSortEntry[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.field !== "string" || !entry.field) {
      return [];
    }
    if (entry.direction !== "asc" && entry.direction !== "desc") return [];
    return [{ field: entry.field, direction: entry.direction }];
  });
}

function parseOffset(raw: string | null): number {
  if (!raw) return 0;
  const offset = Number(raw);
  return Number.isInteger(offset) && offset > 0 ? offset : 0;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFilterInput(value: unknown): value is string | string[] {
  return (
    typeof value === "string" ||
    (Array.isArray(value) && value.every((entry) => typeof entry === "string"))
  );
}

function isBlankFilterInput(value: string | string[]): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return value.trim() === "";
}
