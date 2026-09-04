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
