import type { DateExpr } from "../engine/dates";
import type { StreamQuery, WhereCondition } from "./types";

/**
 * The stream's filters on one line, shown when nothing matched. Only what can
 * empty a stream belongs here: `sort`, `group` and `limit` never exclude a
 * note, so naming them would pad the line whose whole job is explaining the
 * absence — on a default query they were two of its three segments.
 */
export function describeQuery(query: StreamQuery): string {
  const parts: string[] = [];

  parts.push(query.folder.length > 0 ? `folders ${query.folder.join(", ")}` : "whole vault");

  if (query.tags.length > 0) {
    parts.push(`all tags ${query.tags.join(", ")}`);
  }
  if (query.tagsAny.length > 0) {
    parts.push(`any tag ${query.tagsAny.join(", ")}`);
  }
  if (query.excludeFolder.length > 0) {
    parts.push(`not in ${query.excludeFolder.join(", ")}`);
  }
  if (query.excludeTags.length > 0) {
    parts.push(`not tagged ${query.excludeTags.join(", ")}`);
  }
  if (query.title !== null) {
    parts.push(
      query.title.kind === "regex"
        ? `title matches /${query.title.source}/${query.title.flags}`
        : `title contains "${query.title.value}"`,
    );
  }
  for (const clause of query.where) {
    parts.push(`${clause.field} ${describeCondition(clause.condition)}`);
  }
  if (query.from !== null && query.to !== null) {
    parts.push(
      `${query.dateField} from ${describeDate(query.from)} to ${describeDate(query.to)}`,
    );
  } else if (query.from !== null) {
    parts.push(`${query.dateField} from ${describeDate(query.from)} onwards`);
  } else if (query.to !== null) {
    parts.push(`${query.dateField} up to ${describeDate(query.to)}`);
  }

  return parts.join(" · ");
}

function describeCondition(condition: WhereCondition): string {
  switch (condition.kind) {
    case "equals":
      return `= ${String(condition.value)}`;
    case "anyOf":
      return `is one of ${condition.values.map(String).join(", ")}`;
    case "exists":
      return "exists";
    case "missing":
      return "missing";
    case "compare":
      return `${condition.op} ${condition.operand}`;
  }
}

function describeDate(expr: DateExpr): string {
  switch (expr.kind) {
    case "iso":
      return `${expr.year}-${String(expr.month).padStart(2, "0")}-${String(expr.day).padStart(2, "0")}`;
    case "today":
      return "today";
    case "yesterday":
      return "yesterday";
    case "offset":
      return `${expr.amount > 0 ? "+" : ""}${expr.amount}${expr.unit}`;
  }
}
