import { parse as parseYamlText, YAMLParseError } from "yaml";
import { parseDateExpr, type DateExpr, type GroupMode } from "../engine/dates";
import { normalizeTag } from "../engine/note";
import { nearestField } from "./suggest";
import {
  QueryError,
  QUERY_FIELDS,
  defaultQuery,
  type DisplayMode,
  type SortSpec,
  type StreamQuery,
  type TitleMatcher,
} from "./types";

export function parseQuery(source: string): StreamQuery {
  const raw = readYaml(source);
  const query = defaultQuery();
  for (const [key, value] of Object.entries(raw)) {
    applyField(query, key, value);
  }
  return query;
}

/**
 * YAML reads a bare `#` as the start of a comment. Obsidian users write tags
 * with a hash, so `tags: [#book]` (a parse error) and `tags: #book` (silently
 * `null`) are the two mistakes they will actually make. The example names the
 * field at fault: telling someone who typed `folder: #Archive` to quote a tag
 * sends them to the wrong line.
 */
function hashHint(field = "tags"): string {
  return `If you wrote a bare \`#tag\`, YAML read it as a comment — quote it, as in ${field}: ["#book"].`;
}

/** Rephrase the library's own messages where they address a programmer, not a note-writer. */
function explain(message: string): string {
  if (/multiple documents/i.test(message)) {
    // The library advises calling YAML.parseAllDocuments(), which is not
    // useful advice for someone editing a note.
    return "A stream block must be a single set of `field: value` lines. This one has a `---` separator, which YAML reads as the start of a second document.";
  }
  return /comment/i.test(message) ? `${message} ${hashHint()}` : message;
}

function readYaml(source: string): Record<string, unknown> {
  if (source.trim() === "") {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = parseYamlText(source);
  } catch (error) {
    if (error instanceof YAMLParseError) {
      throw new QueryError(explain(error.message.split("\n")[0]), error.linePos?.[0]?.line);
    }
    throw new QueryError(error instanceof Error ? error.message : String(error));
  }

  if (parsed === null || parsed === undefined) {
    return {};
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new QueryError("A stream block must be a set of `field: value` lines");
  }
  return parsed as Record<string, unknown>;
}

function applyField(query: StreamQuery, key: string, value: unknown): void {
  switch (key) {
    case "folder":
      query.folder = toStringList(key, value).map(normalizeFolder);
      return;
    case "exclude-folder":
      query.excludeFolder = toStringList(key, value).map(normalizeFolder);
      return;
    case "tags":
      query.tags = toStringList(key, value).map(normalizeTag);
      return;
    case "tags-any":
      query.tagsAny = toStringList(key, value).map(normalizeTag);
      return;
    case "exclude-tags":
      query.excludeTags = toStringList(key, value).map(normalizeTag);
      return;
    case "title":
      query.title = parseTitle(value);
      return;
    case "date-field":
      query.dateField = toSingleString(key, value);
      return;
    case "from":
      query.from = parseDateBound(key, value);
      return;
    case "to":
      query.to = parseDateBound(key, value);
      return;
    case "sort":
      query.sort = parseSort(value);
      return;
    case "group":
      query.group = parseChoice(key, value, ["day", "month", "year", "none"]) as GroupMode;
      return;
    case "display":
      query.display = parseChoice(key, value, ["full", "preview", "title"]) as DisplayMode;
      return;
    case "preview-length":
      query.previewLength = toPositiveInt(key, value);
      return;
    case "limit":
      query.limit = toPositiveInt(key, value);
      return;
    default:
      throw unknownField(key);
  }
}

function unknownField(key: string): QueryError {
  const nearest = nearestField(key, QUERY_FIELDS);
  // The full list goes out even alongside a guess. No edit-distance rule over
  // a list holding a two-letter name is false-positive free, and a wrong guess
  // that hides the real list is worse than no guess at all.
  const valid = `Valid fields: ${QUERY_FIELDS.join(", ")}`;
  return new QueryError(
    nearest !== null
      ? `Unknown field \`${key}\`. Did you mean \`${nearest}\`? ${valid}`
      : `Unknown field \`${key}\`. ${valid}`,
  );
}

function toStringList(field: string, value: unknown): string[] {
  const items = Array.isArray(value) ? value : [value];
  return items.map((item) => {
    if (item === null || item === undefined) {
      throw new QueryError(`\`${field}\` has no value. ${hashHint(field)}`);
    }
    if (typeof item === "string") {
      const text = item.trim();
      if (text === "") {
        // Dropping it would turn `tags: ""` into no tag filter at all, and
        // quietly delete one constraint from `tags: [book, ""]`.
        throw new QueryError(
          `\`${field}\` has an empty entry. Remove it, or leave the field out to filter on nothing.`,
        );
      }
      return text;
    }
    if (typeof item === "number" || typeof item === "boolean") {
      return String(item);
    }
    throw new QueryError(`\`${field}\` expects text or a list of text`);
  });
}

function normalizeFolder(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
}

function toSingleString(field: string, value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null || value === undefined) {
    // Same answer `toStringList` gives, so `date-field: #x` and `tags: #x` do
    // not explain the same mistake to different standards.
    throw new QueryError(`\`${field}\` has no value. ${hashHint(field)}`);
  }
  throw new QueryError(`\`${field}\` expects a single piece of text`);
}

function parseTitle(value: unknown): TitleMatcher {
  const text = toSingleString("title", value);
  // Slash-wrapped text is always a regex, never a literal. A note's file name
  // cannot contain a slash — that is the path separator — so a literal
  // `/weekly/` title could never match anything anyway.
  const regex = /^\/(.*)\/([gimsuy]*)$/.exec(text);
  if (!regex) {
    return { kind: "text", value: text.toLowerCase() };
  }
  try {
    new RegExp(regex[1], regex[2]);
  } catch (error) {
    throw new QueryError(
      `\`title\` has an invalid regex: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { kind: "regex", source: regex[1], flags: regex[2] };
}

function parseDateBound(field: string, value: unknown): DateExpr {
  // YAML 1.2's core schema has no timestamp type, so `from: 2026-01-01` arrives
  // as a string. Handle a Date anyway in case a future schema change says otherwise.
  const text =
    value instanceof Date
      ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
          value.getDate(),
        ).padStart(2, "0")}`
      : toSingleString(field, value);
  try {
    return parseDateExpr(text);
  } catch (error) {
    throw new QueryError(
      `\`${field}\`: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function parseSort(value: unknown): SortSpec[] {
  const entries = toStringList("sort", value);
  if (entries.length === 0) {
    throw new QueryError("`sort` needs at least one field");
  }
  return entries.map((entry) => {
    const parts = entry.split(/\s+/);
    if (parts.length > 2) {
      throw new QueryError(`\`sort\` entry "${entry}" should be "<field> <asc|desc>"`);
    }
    const direction = (parts[1] ?? "asc").toLowerCase();
    if (direction !== "asc" && direction !== "desc") {
      throw new QueryError(`\`sort\` direction "${parts[1]}" is not valid. Use asc or desc`);
    }
    return { field: parts[0], direction };
  });
}

function parseChoice(field: string, value: unknown, choices: readonly string[]): string {
  const text = toSingleString(field, value).toLowerCase();
  if (!choices.includes(text)) {
    throw new QueryError(`\`${field}\` must be one of: ${choices.join(", ")}`);
  }
  return text;
}

function toPositiveInt(field: string, value: unknown): number {
  const n = typeof value === "number" ? value : Number(toSingleString(field, value));
  if (!Number.isInteger(n) || n <= 0) {
    throw new QueryError(`\`${field}\` expects a whole number above zero`);
  }
  return n;
}
