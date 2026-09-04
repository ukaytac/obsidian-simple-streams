import { parse as parseYamlText, YAMLParseError } from "yaml";
import { normalizeTag } from "../engine/note";
import { nearestField } from "./suggest";
import { QueryError, QUERY_FIELDS, defaultQuery, type StreamQuery } from "./types";

export function parseQuery(source: string): StreamQuery {
  const raw = readYaml(source);
  const query = defaultQuery();
  for (const [key, value] of Object.entries(raw)) {
    applyField(query, key, value);
  }
  return query;
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
      throw new QueryError(error.message.split("\n")[0], error.linePos?.[0]?.line);
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
  return items
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (typeof item === "number" || typeof item === "boolean") {
        return String(item);
      }
      throw new QueryError(`\`${field}\` expects text or a list of text`);
    })
    .filter((item) => item.length > 0);
}

function normalizeFolder(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
}
