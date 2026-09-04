import type { DateExpr, GroupMode } from "../engine/dates";

/** As with GROUP_MODES: one list, and the type derived from it. */
export const DISPLAY_MODES = ["full", "preview", "title"] as const;
export type DisplayMode = (typeof DISPLAY_MODES)[number];

export type SortDirection = "asc" | "desc";
export type CompareOp = ">" | ">=" | "<" | "<=" | "!=";

export interface SortSpec {
  field: string;
  direction: SortDirection;
}

export type TitleMatcher =
  | { kind: "text"; value: string }
  | { kind: "regex"; source: string; flags: string };

export type WhereCondition =
  | { kind: "equals"; value: string | number | boolean }
  | { kind: "anyOf"; values: Array<string | number | boolean> }
  | { kind: "exists" }
  | { kind: "missing" }
  | { kind: "compare"; op: CompareOp; operand: string };

export interface WhereClause {
  field: string;
  condition: WhereCondition;
}

export interface StreamQuery {
  /** Lower-cased, slash-trimmed folder prefixes. Empty means the whole vault. */
  folder: string[];
  /** Normalized tags that must all be present. */
  tags: string[];
  /** Normalized tags of which at least one must be present. */
  tagsAny: string[];
  excludeFolder: string[];
  excludeTags: string[];
  title: TitleMatcher | null;
  where: WhereClause[];
  dateField: string;
  from: DateExpr | null;
  to: DateExpr | null;
  sort: SortSpec[];
  group: GroupMode;
  display: DisplayMode;
  previewLength: number;
  limit: number;
}

/** A fresh default query. A function, not a constant, so callers cannot share arrays. */
export function defaultQuery(): StreamQuery {
  return {
    folder: [],
    tags: [],
    tagsAny: [],
    excludeFolder: [],
    excludeTags: [],
    title: null,
    where: [],
    dateField: "file.ctime",
    from: null,
    to: null,
    sort: [{ field: "file.ctime", direction: "desc" }],
    group: "none",
    display: "preview",
    previewLength: 200,
    limit: 50,
  };
}

export const QUERY_FIELDS = [
  "folder",
  "tags",
  "tags-any",
  "exclude-folder",
  "exclude-tags",
  "title",
  "where",
  "date-field",
  "from",
  "to",
  "sort",
  "group",
  "display",
  "preview-length",
  "limit",
] as const;

export class QueryError extends Error {
  readonly line?: number;

  constructor(message: string, line?: number) {
    super(message);
    this.name = "QueryError";
    this.line = line;
  }
}
