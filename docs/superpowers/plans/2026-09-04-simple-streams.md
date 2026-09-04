# Simple Streams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Obsidian plugin that renders a filtered, sorted, optionally date-grouped stream of notes wherever a ` ```stream ` code block appears.

**Architecture:** A pure engine (`src/engine`, `src/query`) that only ever sees plain objects, plus two thin Obsidian-facing layers: `src/obsidian` (translates `TFile` + `metadataCache` into plain data, owns the refresh loop) and `src/view` (DOM, lazy rendering). Data flows one way: code block → `parseQuery` → `collectNotes` → `runStream` → `StreamChild`. Because the engine never imports `obsidian`, almost the whole test suite runs in plain Node.

**Tech Stack:** TypeScript (strict), esbuild, Vitest, the `yaml` package for parsing the block body, Obsidian API 1.5.7+ (the floor is set by `Vault#getFileByPath`, which Task 19 uses).

**Spec:** `docs/superpowers/specs/2026-09-04-simple-streams-design.md`

**Conventions used throughout:**
- All source lives under `src/`, all tests under `tests/`, mirroring the source path.
- Run a single test file with `npx vitest run tests/<path>.test.ts`.
- Commit after every task. Commit messages use `feat:`, `test:`, `chore:`.
- Times are milliseconds since epoch. Every date calculation is **local time** — never `new Date("2026-09-04")`, which is UTC midnight and lands on the previous day for anyone west of UTC.

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.config.mjs`, `vitest.config.ts`, `manifest.json`, `versions.json`, `src/main.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "obsidian-simple-streams",
  "version": "0.1.0",
  "description": "Render a filtered, sorted stream of notes from a code block.",
  "main": "main.js",
  "private": true,
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "tsc --noEmit && node esbuild.config.mjs production",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "yaml": "^2.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "builtin-modules": "^3.3.0",
    "esbuild": "^0.20.0",
    "obsidian": "^1.5.7",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```

The `yaml` package is a real runtime dependency, bundled into `main.js`. Obsidian exports its own `parseYaml`, but using it would drag the `obsidian` module into `query/parse.ts` and make the parser untestable outside the app. That trade is not worth it.

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["DOM", "ES2020"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Write `esbuild.config.mjs`**

```js
import esbuild from "esbuild";
import process from "node:process";
import builtins from "builtin-modules";

const production = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", ...builtins],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: production,
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 5: Write `manifest.json` and `versions.json`**

`manifest.json`:

```json
{
  "id": "simple-streams",
  "name": "Simple Streams",
  "version": "0.1.0",
  "minAppVersion": "1.5.7",
  "description": "Render a filtered, sorted stream of notes from a code block.",
  "author": "ukaytac",
  "isDesktopOnly": false
}
```

`versions.json`:

```json
{
  "0.1.0": "1.5.7"
}
```

`1.5.7` rather than a rounder `1.5.0`: `Vault#getFileByPath` landed in 1.5.7
(see the `obsidian` package's own CHANGELOG), and Task 19 calls it. On 1.5.0
through 1.5.6 Obsidian would accept the manifest and then throw at render time.
Do not round this down.

- [ ] **Step 6: Write the `src/main.ts` stub**

Real wiring lands in Task 22. This exists so the build has an entry point.

```ts
import { Plugin } from "obsidian";

export default class SimpleStreamsPlugin extends Plugin {
  async onload(): Promise<void> {
    // Wiring lands in Task 22.
  }
}
```

- [ ] **Step 7: Install and verify the toolchain**

Run: `npm install && npm run build && npx vitest run --passWithNoTests`
Expected: `npm install` completes, `main.js` is written, vitest exits 0 with "No test files found" (allowed by the flag).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json esbuild.config.mjs vitest.config.ts manifest.json versions.json src/main.ts
git commit -m "chore: scaffold plugin build and test toolchain"
```

---

### Task 2: The note model

**Files:**
- Create: `src/engine/note.ts`
- Create: `tests/engine/note.test.ts`
- Create: `tests/fixtures/notes.ts`

`NoteMeta` is the plain-data shape every engine function consumes. It is the reason the engine never needs Obsidian.

- [ ] **Step 1: Write the failing test**

`tests/engine/note.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeTag } from "../../src/engine/note";

describe("normalizeTag", () => {
  it("drops a leading hash", () => {
    expect(normalizeTag("#book")).toBe("book");
  });

  it("lower-cases the tag", () => {
    expect(normalizeTag("#Project/Simple-Streams")).toBe("project/simple-streams");
  });

  it("leaves an already normalized tag alone", () => {
    expect(normalizeTag("book")).toBe("book");
  });

  it("drops only the first hash", () => {
    expect(normalizeTag("##odd")).toBe("#odd");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/note.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/note`.

- [ ] **Step 3: Write the implementation**

`src/engine/note.ts`:

```ts
/** A note reduced to plain data. The engine never sees anything else. */
export interface NoteMeta {
  /** Vault-relative path, e.g. "Journal/2026-09-04.md" */
  path: string;
  /** File name without the extension, e.g. "2026-09-04" */
  basename: string;
  /** Normalized tags: no leading "#", lower case, e.g. ["project/streams"] */
  tags: string[];
  frontmatter: Record<string, unknown>;
  /** Creation time, ms since epoch */
  ctime: number;
  /** Modification time, ms since epoch */
  mtime: number;
}

export function normalizeTag(tag: string): string {
  return tag.replace(/^#/, "").toLowerCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/note.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the shared test fixture**

`tests/fixtures/notes.ts`. Every later test builds notes with this, so a test only states the fields it cares about.

```ts
import type { NoteMeta } from "../../src/engine/note";

let counter = 0;

/** Local-time midnight, 1 January 2026 — the default timestamp for fixtures. */
export const DEFAULT_TIME = new Date(2026, 0, 1).getTime();

export function note(overrides: Partial<NoteMeta> = {}): NoteMeta {
  const path = overrides.path ?? `Notes/note-${++counter}.md`;
  const base: NoteMeta = {
    path,
    basename: path.split("/").pop()!.replace(/\.md$/, ""),
    tags: [],
    frontmatter: {},
    ctime: DEFAULT_TIME,
    mtime: DEFAULT_TIME,
  };
  return { ...base, ...overrides };
}

/** Local-time midnight for a Y-M-D triple. Never use `new Date("...")` — that is UTC. */
export function localDate(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day).getTime();
}
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/note.ts tests/engine/note.test.ts tests/fixtures/notes.ts
git commit -m "feat: add the NoteMeta model and tag normalization"
```

---

### Task 3: Date expressions

**Files:**
- Create: `src/engine/dates.ts`
- Create: `tests/engine/dates-expressions.test.ts`

This task covers `from`/`to` expression parsing and day boundaries. Coercion and grouping land in Task 4, in the same file.

- [ ] **Step 1: Write the failing test**

`tests/engine/dates-expressions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { endOfDay, parseDateExpr, resolveDateExpr, startOfDay } from "../../src/engine/dates";

const NOW = new Date(2026, 8, 4, 14, 30); // 4 September 2026, 14:30 local

describe("parseDateExpr", () => {
  it("parses an ISO date", () => {
    expect(parseDateExpr("2026-01-31")).toEqual({ kind: "iso", year: 2026, month: 1, day: 31 });
  });

  it("parses today and yesterday, case-insensitively", () => {
    expect(parseDateExpr("today")).toEqual({ kind: "today" });
    expect(parseDateExpr(" YESTERDAY ")).toEqual({ kind: "yesterday" });
  });

  it("parses relative offsets", () => {
    expect(parseDateExpr("-30d")).toEqual({ kind: "offset", amount: -30, unit: "d" });
    expect(parseDateExpr("-2w")).toEqual({ kind: "offset", amount: -2, unit: "w" });
    expect(parseDateExpr("+6m")).toEqual({ kind: "offset", amount: 6, unit: "m" });
    expect(parseDateExpr("+1y")).toEqual({ kind: "offset", amount: 1, unit: "y" });
  });

  it("requires a sign on an offset, rather than guessing a direction", () => {
    expect(() => parseDateExpr("1y")).toThrow(/needs a sign: -1y for the past, \+1y for the future/);
    expect(() => parseDateExpr("30d")).toThrow(/needs a sign/);
  });

  it("rejects an offset too large to resolve to a real date", () => {
    expect(() => parseDateExpr("-999999999d")).toThrow(/too large an offset/);
    expect(() => parseDateExpr("+100001d")).toThrow(/too large an offset/);
    expect(parseDateExpr("-100000d")).toEqual({ kind: "offset", amount: -100000, unit: "d" });
  });

  it("rejects a date that does not exist", () => {
    expect(() => parseDateExpr("2026-02-30")).toThrow(/not a real date/);
  });

  it("rejects text it does not understand", () => {
    expect(() => parseDateExpr("last tuesday")).toThrow(/YYYY-MM-DD/);
  });
});

describe("day boundaries", () => {
  it("snaps to the start of the local day", () => {
    expect(new Date(startOfDay(NOW)).getHours()).toBe(0);
    expect(new Date(startOfDay(NOW)).getDate()).toBe(4);
  });

  it("snaps to the last millisecond of the local day", () => {
    const end = new Date(endOfDay(NOW));
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });
});

describe("resolveDateExpr", () => {
  it("resolves today to the current local day", () => {
    expect(resolveDateExpr({ kind: "today" }, NOW, "start")).toBe(new Date(2026, 8, 4).getTime());
  });

  it("resolves yesterday", () => {
    expect(resolveDateExpr({ kind: "yesterday" }, NOW, "start")).toBe(new Date(2026, 8, 3).getTime());
  });

  it("resolves a day offset across a month boundary", () => {
    expect(resolveDateExpr({ kind: "offset", amount: -30, unit: "d" }, NOW, "start"))
      .toBe(new Date(2026, 7, 5).getTime());
  });

  it("resolves a month offset", () => {
    expect(resolveDateExpr({ kind: "offset", amount: -6, unit: "m" }, NOW, "start"))
      .toBe(new Date(2026, 2, 4).getTime());
  });

  it("resolves an ISO date to the end of that day when asked for the end bound", () => {
    expect(resolveDateExpr({ kind: "iso", year: 2026, month: 1, day: 1 }, NOW, "end"))
      .toBe(new Date(2026, 0, 1, 23, 59, 59, 999).getTime());
  });

  it("clamps a month offset to the end of a shorter month", () => {
    // Naive setMonth computes 31 February and rolls forward to 3 March.
    const endOfMarch = new Date(2026, 2, 31, 9, 0);
    expect(resolveDateExpr({ kind: "offset", amount: -1, unit: "m" }, endOfMarch, "start"))
      .toBe(new Date(2026, 1, 28).getTime());
  });

  it("never lets a month offset land back inside the month it started in", () => {
    // Naive setMonth turns 31 May minus one month into 1 May.
    const endOfMay = new Date(2026, 4, 31, 9, 0);
    expect(resolveDateExpr({ kind: "offset", amount: -1, unit: "m" }, endOfMay, "start"))
      .toBe(new Date(2026, 3, 30).getTime());
  });

  it("clamps a year offset from a leap day", () => {
    const leapDay = new Date(2028, 1, 29, 9, 0);
    expect(resolveDateExpr({ kind: "offset", amount: -1, unit: "y" }, leapDay, "start"))
      .toBe(new Date(2027, 1, 28).getTime());
  });

  it("resolves the largest allowed offset to a real date, not NaN", () => {
    const result = resolveDateExpr({ kind: "offset", amount: -100000, unit: "d" }, NOW, "start");
    expect(Number.isNaN(result)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/dates-expressions.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/dates`.

- [ ] **Step 3: Write the implementation**

`src/engine/dates.ts`:

```ts
export type DateExpr =
  | { kind: "iso"; year: number; month: number; day: number }
  | { kind: "today" }
  | { kind: "yesterday" }
  | { kind: "offset"; amount: number; unit: "d" | "w" | "m" | "y" };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const OFFSET = /^([+-]\d+)([dwmy])$/;
const UNSIGNED_OFFSET = /^\d+[dwmy]$/;
/** Past this, Date arithmetic overflows to NaN and a bound would silently vanish. */
const MAX_OFFSET = 100000;

export function parseDateExpr(input: string): DateExpr {
  const text = input.trim().toLowerCase();
  if (text === "today") {
    return { kind: "today" };
  }
  if (text === "yesterday") {
    return { kind: "yesterday" };
  }

  const iso = ISO_DATE.exec(text);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (localDateFrom(year, month, day) === null) {
      throw new Error(`"${input}" is not a real date`);
    }
    return { kind: "iso", year, month, day };
  }

  const offset = OFFSET.exec(text);
  if (offset) {
    const amount = Number(offset[1]);
    if (Math.abs(amount) > MAX_OFFSET) {
      throw new Error(`"${input}" is too large an offset. Keep it under ${MAX_OFFSET} units`);
    }
    return { kind: "offset", amount, unit: offset[2] as "d" | "w" | "m" | "y" };
  }

  // A bare "30d" is ambiguous, and guessing a direction turns a typo into an
  // empty stream with no explanation.
  if (UNSIGNED_OFFSET.test(text)) {
    throw new Error(`"${input}" needs a sign: -${text} for the past, +${text} for the future`);
  }

  throw new Error(
    `"${input}" is not a date. Use YYYY-MM-DD, today, yesterday, or a signed offset like -30d`,
  );
}

export function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).getTime();
}

export function endOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
}

export function resolveDateExpr(expr: DateExpr, now: Date, bound: "start" | "end"): number {
  const day = resolveToDay(expr, now);
  return bound === "start" ? startOfDay(day) : endOfDay(day);
}

function resolveToDay(expr: DateExpr, now: Date): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (expr.kind) {
    case "iso":
      return new Date(expr.year, expr.month - 1, expr.day);
    case "today":
      return today;
    case "yesterday":
      today.setDate(today.getDate() - 1);
      return today;
    case "offset":
      switch (expr.unit) {
        case "d":
          today.setDate(today.getDate() + expr.amount);
          break;
        case "w":
          today.setDate(today.getDate() + expr.amount * 7);
          break;
        case "m":
          addMonths(today, expr.amount);
          break;
        case "y":
          addMonths(today, expr.amount * 12);
          break;
      }
      return today;
  }
}

/**
 * Shift by whole months, clamping to the end of the target month, in place.
 * `setMonth` alone overflows: 31 March minus one month computes 31 February and
 * rolls forward to 3 March, and 31 May minus one month lands back on 1 May.
 */
function addMonths(date: Date, months: number): void {
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  date.setDate(Math.min(day, daysInMonth(date.getFullYear(), date.getMonth())));
}

/** Day 0 of the next month is the last day of this one. */
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Local midnight for a Y-M-D triple, or null when the triple is not a real
 * date. The round trip is the check: JavaScript rolls 2026-02-30 over into
 * 1 March rather than rejecting it, so comparing the components back out is
 * the only way to tell the difference. Both halves of this module rely on
 * this one definition of "a real date".
 */
function localDateFrom(year: number, month: number, day: number): Date | null {
  const probe = new Date(year, month - 1, day);
  const real =
    probe.getFullYear() === year && probe.getMonth() === month - 1 && probe.getDate() === day;
  return real ? probe : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/dates-expressions.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/dates.ts tests/engine/dates-expressions.test.ts
git commit -m "feat: parse and resolve stream date expressions"
```

---

### Task 4: Date coercion and group keys

**Files:**
- Modify: `src/engine/dates.ts` (append; do not touch what Task 3 wrote)
- Create: `tests/engine/dates-values.test.ts`

Three jobs here: turning a frontmatter value into a timestamp, deciding whether a value is even date-shaped, and computing group keys and headers.

`looksLikeDate`/`dateValue` exist to stop `Date.parse` from doing damage. `Date.parse("May")` succeeds in some runtimes, which would silently turn a `status: May` field into a date during sorting and comparison. Only `YYYY-MM-DD…` strings and real `Date` objects are treated as dates in those positions.

- [ ] **Step 1: Write the failing test**

`tests/engine/dates-values.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { coerceDate, dateValue, formatGroupHeader, groupKey, looksLikeDate } from "../../src/engine/dates";

describe("coerceDate", () => {
  it("reads a Date", () => {
    const d = new Date(2026, 8, 4);
    expect(coerceDate(d)).toBe(d.getTime());
  });

  it("passes a finite number through as a timestamp", () => {
    expect(coerceDate(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it("reads a date-only string as LOCAL midnight, not UTC", () => {
    expect(coerceDate("2026-09-04")).toBe(new Date(2026, 8, 4).getTime());
  });

  it("reads a date-time string", () => {
    expect(coerceDate("2026-09-04T08:30")).toBe(new Date(2026, 8, 4, 8, 30).getTime());
  });

  it("returns null for values that are not dates", () => {
    expect(coerceDate("not a date")).toBeNull();
    expect(coerceDate(undefined)).toBeNull();
    expect(coerceDate(null)).toBeNull();
    expect(coerceDate({})).toBeNull();
    expect(coerceDate(Number.NaN)).toBeNull();
  });

  it("returns null for an ISO-shaped triple that is not a real date", () => {
    // Left unchecked, JavaScript rolls these over: 2026-02-30 becomes 1 March
    // and the note would sort and group as 1 March with nothing to explain it.
    expect(coerceDate("2026-02-30")).toBeNull();
    expect(coerceDate("2026-13-40")).toBeNull();
    expect(coerceDate("2026-99-99")).toBeNull();
    expect(dateValue("2026-13-40")).toBeNull();
  });

  it("returns null for a date-time whose day does not exist", () => {
    // Date.parse checks the hour but not the day, so these roll over unless the
    // date part is validated separately from the bare-date form.
    expect(coerceDate("2026-02-30T08:30")).toBeNull();
    expect(coerceDate("2026-04-31T00:00")).toBeNull();
    expect(coerceDate("2027-02-29T10:00")).toBeNull();
    expect(coerceDate("2026-02-30 08:30")).toBeNull();
  });
});

describe("looksLikeDate / dateValue", () => {
  it("only accepts ISO-shaped strings", () => {
    expect(looksLikeDate("2026-09-04")).toBe(true);
    expect(looksLikeDate("2026-09-04T08:00")).toBe(true);
    expect(looksLikeDate("May")).toBe(false);
    expect(looksLikeDate(20260904)).toBe(false);
  });

  it("refuses to date-ify a plain word even if Date.parse would", () => {
    expect(dateValue("May")).toBeNull();
    expect(dateValue("done")).toBeNull();
  });

  it("accepts Date objects and ISO strings", () => {
    expect(dateValue("2026-09-04")).toBe(new Date(2026, 8, 4).getTime());
    expect(dateValue(new Date(2026, 8, 4))).toBe(new Date(2026, 8, 4).getTime());
  });
});

describe("groupKey", () => {
  const ms = new Date(2026, 8, 4).getTime();

  it("keys by day, month and year", () => {
    expect(groupKey(ms, "day")).toBe("2026-09-04");
    expect(groupKey(ms, "month")).toBe("2026-09");
    expect(groupKey(ms, "year")).toBe("2026");
  });

  it("returns an empty key when grouping is off", () => {
    expect(groupKey(ms, "none")).toBe("");
  });

  it("separates a month boundary", () => {
    const aug31 = new Date(2026, 7, 31).getTime();
    const sep1 = new Date(2026, 8, 1).getTime();
    expect(groupKey(aug31, "month")).not.toBe(groupKey(sep1, "month"));
  });

  it("separates a year boundary", () => {
    const dec31 = new Date(2026, 11, 31).getTime();
    const jan1 = new Date(2027, 0, 1).getTime();
    expect(groupKey(dec31, "year")).not.toBe(groupKey(jan1, "year"));
    expect(groupKey(dec31, "month")).not.toBe(groupKey(jan1, "month"));
  });
});

describe("formatGroupHeader", () => {
  const ms = new Date(2026, 8, 4).getTime();

  it("formats a day, month and year header", () => {
    expect(formatGroupHeader(ms, "day", "en-GB")).toBe("4 September 2026");
    expect(formatGroupHeader(ms, "month", "en-GB")).toBe("September 2026");
    expect(formatGroupHeader(ms, "year", "en-GB")).toBe("2026");
  });

  it("returns an empty header when grouping is off", () => {
    expect(formatGroupHeader(ms, "none", "en-GB")).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/dates-values.test.ts`
Expected: FAIL — `coerceDate` is not exported.

- [ ] **Step 3: Append the implementation to `src/engine/dates.ts`**

```ts
/**
 * The list and the type are one thing, so neither can drift from the other.
 * Adding an entry here is a compile error in `groupKey` and `headerOptions`
 * until both handle it.
 */
export const GROUP_MODES = ["day", "month", "year", "none"] as const;
export type GroupMode = (typeof GROUP_MODES)[number];

const ISO_PREFIX = /^\d{4}-\d{2}-\d{2}/;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
/** The date part of a date-time string, so an impossible day can be caught there too. */
const ISO_HEAD = /^(\d{4})-(\d{2})-(\d{2})(?=[T ]|$)/;

/**
 * Turn a declared date value into a timestamp. Permissive on purpose: this runs
 * on fields the query named as dates, so trying hard is the right behaviour.
 */
export function coerceDate(value: unknown): number | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }
  if (typeof value === "number") {
    // Milliseconds since the epoch, matching Date.prototype.getTime(). A field
    // holding Unix *seconds* resolves to January 1970 rather than being
    // rejected, so point `date-field` at a field that really holds a date.
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  const dateOnly = DATE_ONLY.exec(text);
  if (dateOnly) {
    // Local midnight on purpose: new Date("2026-09-04") is UTC midnight, which
    // lands on the previous day for anyone west of UTC. An impossible triple is
    // unparseable rather than rolled over, so the caller falls back to
    // file.ctime instead of silently sorting the note as 1 March.
    const d = localDateFrom(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
    return d === null ? null : d.getTime();
  }

  // Date.parse validates the time fields but rolls an impossible day over:
  // "2026-02-30T08:30" becomes 2 March. Guarding only the bare date above
  // would leave that hole wide open.
  const head = ISO_HEAD.exec(text);
  if (head !== null && localDateFrom(Number(head[1]), Number(head[2]), Number(head[3])) === null) {
    return null;
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Is this value shaped like an ISO date? Used to keep Date.parse away from
 * plain words. A syntactic check only: `2026-99-99` passes this and is still
 * rejected by `coerceDate`, which is where validity is decided.
 */
export function looksLikeDate(value: unknown): boolean {
  return typeof value === "string" && ISO_PREFIX.test(value.trim());
}

/**
 * Strict counterpart to coerceDate, for fields nobody declared to be dates —
 * sorting and `where` comparisons. Returns null unless the value really is one.
 */
export function dateValue(value: unknown): number | null {
  if (value instanceof Date) {
    return coerceDate(value);
  }
  return looksLikeDate(value) ? coerceDate(value) : null;
}

export function groupKey(ms: number, mode: GroupMode): string {
  const d = new Date(ms);
  switch (mode) {
    case "none":
      return "";
    case "year":
      return String(d.getFullYear());
    case "month":
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    case "day":
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    default:
      return assertNeverMode(mode);
  }
}

export function formatGroupHeader(ms: number, mode: GroupMode, locale?: string): string {
  const options = headerOptions(mode);
  return options === null ? "" : new Intl.DateTimeFormat(locale, options).format(new Date(ms));
}

function headerOptions(mode: GroupMode): Intl.DateTimeFormatOptions | null {
  switch (mode) {
    case "none":
      return null;
    case "year":
      return { year: "numeric" };
    case "month":
      return { year: "numeric", month: "long" };
    case "day":
      return { year: "numeric", month: "long", day: "numeric" };
    default:
      return assertNeverMode(mode);
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Unreachable. Both switches above cover every GROUP_MODES entry, so adding a
 * mode to that list fails to compile here until it is handled. Without this,
 * an unhandled mode fell through to day-shaped output and a "week" grouping
 * would have silently rendered as days.
 */
function assertNeverMode(mode: never): never {
  throw new Error(`Unhandled group mode: ${String(mode)}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/dates-values.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/dates.ts tests/engine/dates-values.test.ts
git commit -m "feat: coerce date values and compute group keys"
```

---

### Task 5: Nearest-field suggestions

**Files:**
- Create: `src/query/suggest.ts`
- Create: `tests/query/suggest.test.ts`

Unknown fields are hard errors, so the error message has to earn that strictness by naming the field the author probably meant.

- [ ] **Step 1: Write the failing test**

`tests/query/suggest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { editDistance, nearestField } from "../../src/query/suggest";

const FIELDS = ["folder", "tags", "tags-any", "exclude-folder", "sort", "group", "display", "limit"];

/** The list Task 7 actually passes in. Kept in sync with QUERY_FIELDS by hand. */
const REAL_FIELDS = [
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
];

describe("editDistance", () => {
  it("is zero for identical strings", () => {
    expect(editDistance("tags", "tags")).toBe(0);
  });

  it("counts an insertion", () => {
    expect(editDistance("tag", "tags")).toBe(1);
  });

  it("counts a substitution", () => {
    expect(editDistance("sart", "sort")).toBe(1);
  });

  it("handles an empty string", () => {
    expect(editDistance("", "sort")).toBe(4);
  });
});

describe("nearestField", () => {
  it("suggests the obvious typo", () => {
    expect(nearestField("tag", FIELDS)).toBe("tags");
    expect(nearestField("sart", FIELDS)).toBe("sort");
    expect(nearestField("Limit", FIELDS)).toBe("limit");
  });

  it("suggests nothing when the input resembles nothing", () => {
    expect(nearestField("qqqqqqqqqq", FIELDS)).toBeNull();
  });

  it("suggests nothing from an empty candidate list", () => {
    expect(nearestField("tags", [])).toBeNull();
  });

  it("suggests nothing for an input too short to be confident about", () => {
    // Against the real field list every two-letter input used to come out as
    // `to`, which is the one field short enough to attract all of them.
    for (const input of ["ta", "fo", "gr", "wh", "li", "xy"]) {
      expect(nearestField(input, REAL_FIELDS), input).toBeNull();
    }
  });

  it("still corrects realistic typos against the real field list", () => {
    expect(nearestField("tagsany", REAL_FIELDS)).toBe("tags-any");
    expect(nearestField("date_field", REAL_FIELDS)).toBe("date-field");
    expect(nearestField("previewlength", REAL_FIELDS)).toBe("preview-length");
    expect(nearestField("excludefolder", REAL_FIELDS)).toBe("exclude-folder");
    expect(nearestField("groupby", REAL_FIELDS)).toBe("group");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/query/suggest.test.ts`
Expected: FAIL — cannot resolve `../../src/query/suggest`.

- [ ] **Step 3: Write the implementation**

`src/query/suggest.ts`:

```ts
/** Levenshtein distance, two rows at a time. */
export function editDistance(a: string, b: string): number {
  const cols = b.length + 1;
  let previous = new Array<number>(cols);
  let current = new Array<number>(cols);

  for (let j = 0; j < cols; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    const swap = previous;
    previous = current;
    current = swap;
  }

  return previous[cols - 1];
}

export function nearestField(input: string, candidates: readonly string[]): string | null {
  // Below three characters there is nothing to be confident about: the field
  // list holds a two-letter name (`to`), so every short input lands on it —
  // "gr", "wh" and "li" all came out as `to` before this gate.
  if (input.length < 3) {
    return null;
  }

  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = editDistance(input.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  // Only suggest when the guess is actually close, so nonsense input gets the
  // full field list instead of a misleading "did you mean".
  const threshold = Math.max(2, Math.floor(input.length / 3));
  return best !== null && bestDistance <= threshold ? best : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/query/suggest.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/query/suggest.ts tests/query/suggest.test.ts
git commit -m "feat: suggest the nearest valid field name"
```

---

### Task 6: Field resolution

**Files:**
- Create: `src/engine/fields.ts`
- Create: `tests/engine/fields.test.ts`

One namespace serves both `sort` and `where`: frontmatter keys by name, plus the four reserved `file.*` properties.

Those four names live only in the `switch`. An exported array of them would be a second copy that nothing enforces — `noUnusedLocals` does not flag unused exports, so the two could drift apart in silence — and no task needs the list. If one ever does, add it then.

- [ ] **Step 1: Write the failing test**

`tests/engine/fields.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveField, resolveNoteDate } from "../../src/engine/fields";
import { localDate, note } from "../fixtures/notes";

describe("resolveField", () => {
  it("reads a frontmatter key by name", () => {
    const n = note({ frontmatter: { rating: 5, status: "done" } });
    expect(resolveField(n, "rating")).toBe(5);
    expect(resolveField(n, "status")).toBe("done");
  });

  it("reads the reserved file properties", () => {
    const n = note({ path: "Journal/2026-09-04.md", ctime: 111, mtime: 222 });
    expect(resolveField(n, "file.path")).toBe("Journal/2026-09-04.md");
    expect(resolveField(n, "file.name")).toBe("2026-09-04");
    expect(resolveField(n, "file.ctime")).toBe(111);
    expect(resolveField(n, "file.mtime")).toBe(222);
  });

  it("never reads frontmatter through the reserved file. prefix", () => {
    const n = note({ frontmatter: { "file.name": "spoofed" } });
    expect(resolveField(n, "file.name")).toBe(n.basename);
    expect(resolveField(n, "file.bogus")).toBeUndefined();
  });

  it("returns undefined for a missing frontmatter key", () => {
    expect(resolveField(note(), "nope")).toBeUndefined();
  });

  it("does not let inherited object members pose as frontmatter", () => {
    // Otherwise `where: { toString: exists }` matches every note, and sorting
    // on one hands a function to the comparator.
    const n = note();
    for (const key of [
      "constructor",
      "toString",
      "hasOwnProperty",
      "valueOf",
      "isPrototypeOf",
      "__proto__",
    ]) {
      expect(resolveField(n, key), key).toBeUndefined();
    }
  });
});

describe("resolveNoteDate", () => {
  it("reads the named frontmatter date", () => {
    const n = note({ frontmatter: { date: "2026-09-04" } });
    expect(resolveNoteDate(n, "date")).toBe(localDate(2026, 9, 4));
  });

  it("falls back to ctime when the field is missing", () => {
    const n = note({ ctime: localDate(2026, 1, 15) });
    expect(resolveNoteDate(n, "date")).toBe(localDate(2026, 1, 15));
  });

  it("falls back to ctime when the field is not a date", () => {
    const n = note({ frontmatter: { date: "someday" }, ctime: localDate(2026, 1, 15) });
    expect(resolveNoteDate(n, "date")).toBe(localDate(2026, 1, 15));
  });

  it("reads file.ctime directly, which is the default date field", () => {
    const n = note({ ctime: localDate(2026, 3, 1) });
    expect(resolveNoteDate(n, "file.ctime")).toBe(localDate(2026, 3, 1));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/fields.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/fields`.

- [ ] **Step 3: Write the implementation**

`src/engine/fields.ts`:

```ts
import { coerceDate } from "./dates";
import type { NoteMeta } from "./note";

/**
 * Resolve a field reference against a note. `file.` is a reserved prefix: an
 * unknown `file.something` is undefined rather than a frontmatter lookup, so a
 * note cannot shadow a built-in property.
 */
export function resolveField(note: NoteMeta, field: string): unknown {
  switch (field) {
    case "file.ctime":
      return note.ctime;
    case "file.mtime":
      return note.mtime;
    case "file.name":
      return note.basename;
    case "file.path":
      return note.path;
    default:
      if (field.startsWith("file.")) {
        return undefined;
      }
      // Own keys only. A plain object inherits `toString`, `constructor` and
      // friends, so a bare index would report them present on every note.
      return Object.prototype.hasOwnProperty.call(note.frontmatter, field)
        ? note.frontmatter[field]
        : undefined;
  }
}

/** The note's date for range filtering and grouping, falling back to ctime. */
export function resolveNoteDate(note: NoteMeta, dateField: string): number {
  return coerceDate(resolveField(note, dateField)) ?? note.ctime;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/fields.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/fields.ts tests/engine/fields.test.ts
git commit -m "feat: resolve field references and note dates"
```

---
### Task 7: Query types and list-field parsing

**Files:**
- Create: `src/query/types.ts`
- Create: `src/query/parse.ts`
- Create: `tests/query/parse-lists.test.ts`

`StreamQuery` is the whole contract between the parser and the engine. Note what it does **not** hold: `from`/`to` stay as unresolved `DateExpr` values, so `today` means today whenever the stream renders rather than whenever the note was opened.

- [ ] **Step 1: Write `src/query/types.ts`**

```ts
import type { DateExpr, GroupMode } from "../engine/dates";

export type { GroupMode };

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
```

- [ ] **Step 2: Write the failing test**

`tests/query/parse-lists.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseQuery } from "../../src/query/parse";
import { defaultQuery } from "../../src/query/types";

describe("parseQuery — empty and malformed input", () => {
  it("returns the defaults for an empty block", () => {
    expect(parseQuery("")).toEqual(defaultQuery());
    expect(parseQuery("   \n  ")).toEqual(defaultQuery());
  });

  it("rejects a block that is not a field map", () => {
    expect(() => parseQuery("- one\n- two")).toThrow(/field: value/);
    expect(() => parseQuery("just some text")).toThrow(/field: value/);
  });

  it("reports invalid YAML with a line number", () => {
    try {
      parseQuery("folder: Journal\ntags: [unclosed\n");
      throw new Error("expected parseQuery to throw");
    } catch (error) {
      expect((error as Error).name).toBe("QueryError");
      expect((error as { line?: number }).line).toBeGreaterThan(0);
    }
  });
});

describe("parseQuery — unknown fields", () => {
  it("rejects an unknown field and suggests the nearest one", () => {
    expect(() => parseQuery("tag: book")).toThrow(/Unknown field `tag`.*Did you mean `tags`/s);
  });

  it("lists the valid fields when nothing is close", () => {
    expect(() => parseQuery("qqqqqqqqqq: 1")).toThrow(/Valid fields: folder, tags/);
  });

  it("lists the valid fields even when it has a suggestion", () => {
    // A guess can be wrong; it must never be the only thing the reader gets.
    expect(() => parseQuery("tag: book")).toThrow(/Valid fields: folder, tags/);
  });
});

describe("parseQuery — folders", () => {
  it("accepts a single folder", () => {
    expect(parseQuery("folder: Journal").folder).toEqual(["journal"]);
  });

  it("accepts a list of folders", () => {
    expect(parseQuery("folder: [Journal, Notes/Books]").folder).toEqual(["journal", "notes/books"]);
  });

  it("trims surrounding slashes", () => {
    expect(parseQuery("folder: /Journal/").folder).toEqual(["journal"]);
  });

  it("parses exclude-folder", () => {
    expect(parseQuery("exclude-folder: [Archive]").excludeFolder).toEqual(["archive"]);
  });
});

describe("parseQuery — tags", () => {
  it("normalizes tags with and without a hash", () => {
    // The hash must be quoted; YAML would read a bare one as a comment.
    expect(parseQuery('tags: ["#Book", reading]').tags).toEqual(["book", "reading"]);
  });

  it("accepts a single tag as a scalar", () => {
    expect(parseQuery("tags: book").tags).toEqual(["book"]);
  });

  it("parses tags-any and exclude-tags", () => {
    const query = parseQuery("tags-any: [film, series]\nexclude-tags: draft");
    expect(query.tagsAny).toEqual(["film", "series"]);
    expect(query.excludeTags).toEqual(["draft"]);
  });

  it("rejects a list holding a map", () => {
    expect(() => parseQuery("tags:\n  - a: 1")).toThrow(/`tags` expects text/);
  });
});

describe("parseQuery — a bare hash is a YAML comment", () => {
  it("names the real cause when the hash breaks the parse", () => {
    expect(() => parseQuery("tags: [#book, reading]")).toThrow(/quote it/);
  });

  it("names the real cause when the hash silently empties the value", () => {
    // `tags: #book` parses as `tags: null`, so without this the message would
    // only say the field expects text.
    expect(() => parseQuery("tags: #book")).toThrow(/`tags` has no value.*quote it/s);
    expect(() => parseQuery("tags:\n  - #book")).toThrow(/`tags` has no value/);
  });

  it("accepts the quoted form", () => {
    expect(parseQuery('tags: "#book"').tags).toEqual(["book"]);
    expect(parseQuery('exclude-tags: ["#draft"]').excludeTags).toEqual(["draft"]);
  });

  it("names the field at fault, not always tags", () => {
    expect(() => parseQuery("folder: #Archive")).toThrow(/as in folder: "#book"/);
  });
});

describe("parseQuery — an empty entry is a mistake, not a filter", () => {
  it("rejects an empty scalar", () => {
    expect(() => parseQuery('tags: ""')).toThrow(/`tags` has an empty entry/);
  });

  it("rejects an empty entry sitting among real ones", () => {
    // Dropping it would quietly remove one of the two constraints.
    expect(() => parseQuery('tags: [book, ""]')).toThrow(/empty entry/);
    expect(() => parseQuery('tags: ["   "]')).toThrow(/empty entry/);
  });

  it("still accepts an explicitly empty list as no constraint", () => {
    expect(parseQuery("tags: []").tags).toEqual([]);
  });
});

describe("parseQuery — messages written for a note-writer", () => {
  it("explains a second YAML document instead of naming a JS API", () => {
    const source = "folder: a\n---\nfolder: b";
    expect(() => parseQuery(source)).toThrow(/single set of `field: value` lines/);
    expect(() => parseQuery(source)).not.toThrow(/parseAllDocuments/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/query/parse-lists.test.ts`
Expected: FAIL — cannot resolve `../../src/query/parse`.

- [ ] **Step 4: Write `src/query/parse.ts`**

Tasks 8 and 9 extend `applyField` and add helpers to this same file. The `switch` has no cases for `title`, `sort`, `where` and friends yet, so those fields land in `default` and report as unknown until then — that is expected between tasks.

```ts
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
  // The example has no brackets on purpose: a quoted scalar is valid for a
  // list field and a single-value field alike, whereas `date-field: ["#book"]`
  // would send the reader straight into a second error.
  return `If you wrote a bare \`#tag\`, YAML read it as a comment — quote it, as in ${field}: "#book".`;
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/query/parse-lists.test.ts`
Expected: PASS, 22 tests.

- [ ] **Step 6: Commit**

```bash
git add src/query/types.ts src/query/parse.ts tests/query/parse-lists.test.ts
git commit -m "feat: parse folder and tag fields of a stream query"
```

---

### Task 8: Parsing title, dates, sort, group and display

**Files:**
- Modify: `src/query/parse.ts` (add cases to `applyField`, append helpers)
- Create: `tests/query/parse-scalars.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/query/parse-scalars.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GROUP_MODES } from "../../src/engine/dates";
import { parseQuery } from "../../src/query/parse";
import { DISPLAY_MODES } from "../../src/query/types";

describe("parseQuery — title", () => {
  it("treats plain text as a lower-cased substring match", () => {
    expect(parseQuery("title: 2026-").title).toEqual({ kind: "text", value: "2026-" });
    expect(parseQuery("title: Weekly").title).toEqual({ kind: "text", value: "weekly" });
  });

  it("treats slash-wrapped text as a regex", () => {
    expect(parseQuery("title: /^20\\d\\d-/").title).toEqual({
      kind: "regex",
      source: "^20\\d\\d-",
      flags: "",
    });
  });

  it("keeps regex flags", () => {
    expect(parseQuery("title: /weekly/i").title).toEqual({
      kind: "regex",
      source: "weekly",
      flags: "i",
    });
  });

  it("rejects an invalid regex", () => {
    expect(() => parseQuery("title: /([/")).toThrow(/`title` has an invalid regex/);
  });
});

describe("parseQuery — a missing value explains itself the same way everywhere", () => {
  it("gives the hash hint on single-value fields too, not just list fields", () => {
    // `tags: #x` already explained itself; `date-field: #x` used to say only
    // that the field expects text.
    expect(() => parseQuery("date-field: #x")).toThrow(/`date-field` has no value.*quote it/s);
    expect(() => parseQuery("title:")).toThrow(/`title` has no value/);
    expect(() => parseQuery("group: #x")).toThrow(/`group` has no value/);
  });

  it("suggests a form the field actually accepts", () => {
    // Bracketed advice on a single-value field would land the reader in a
    // second error: `date-field: ["#book"]` is the wrong shape.
    expect(() => parseQuery("date-field: #x")).toThrow(/as in date-field: "#book"/);
    expect(() => parseQuery('date-field: ["#book"]')).toThrow(/expects a single piece of text/);
    expect(parseQuery('date-field: "#book"').dateField).toBe("#book");
  });

  it("still rejects a structured value as the wrong shape", () => {
    expect(() => parseQuery("date-field:\n  a: 1")).toThrow(/expects a single piece of text/);
  });

  it("rejects an empty single value, which would filter on nothing", () => {
    // `title: ""` matched every note, so the field looked like a filter and
    // behaved as if it were absent.
    expect(() => parseQuery('title: ""')).toThrow(/`title` is empty/);
    expect(() => parseQuery('title: "   "')).toThrow(/`title` is empty/);
    expect(() => parseQuery('date-field: ""')).toThrow(/`date-field` is empty/);
  });
});

describe("parseQuery — date-field, from and to", () => {
  it("reads the date field verbatim, preserving case", () => {
    expect(parseQuery("date-field: Created").dateField).toBe("Created");
  });

  it("stores from and to unresolved", () => {
    const query = parseQuery("from: 2026-01-01\nto: today");
    expect(query.from).toEqual({ kind: "iso", year: 2026, month: 1, day: 1 });
    expect(query.to).toEqual({ kind: "today" });
  });

  it("accepts a relative offset", () => {
    expect(parseQuery("from: -30d").from).toEqual({ kind: "offset", amount: -30, unit: "d" });
  });

  it("reports a bad date against the field that held it", () => {
    expect(() => parseQuery("from: last tuesday")).toThrow(/`from`:.*YYYY-MM-DD/s);
  });
});

describe("parseQuery — sort", () => {
  it("defaults to newest first by creation time", () => {
    expect(parseQuery("").sort).toEqual([{ field: "file.ctime", direction: "desc" }]);
  });

  it("parses a single sort key", () => {
    expect(parseQuery("sort: date desc").sort).toEqual([{ field: "date", direction: "desc" }]);
  });

  it("defaults the direction to ascending", () => {
    expect(parseQuery("sort: rating").sort).toEqual([{ field: "rating", direction: "asc" }]);
  });

  it("parses several sort keys in order", () => {
    expect(parseQuery("sort: [date desc, file.name asc]").sort).toEqual([
      { field: "date", direction: "desc" },
      { field: "file.name", direction: "asc" },
    ]);
  });

  it("rejects an unknown direction", () => {
    expect(() => parseQuery("sort: date sideways")).toThrow(/direction "sideways" is not valid/);
  });

  it("rejects an entry with too many words", () => {
    expect(() => parseQuery("sort: date desc extra")).toThrow(/"<field> <asc\|desc>"/);
  });

  it("rejects an empty sort", () => {
    expect(() => parseQuery("sort: []")).toThrow(/`sort` needs at least one field/);
  });
});

describe("parseQuery — group, display and numbers", () => {
  it("parses the grouping modes", () => {
    expect(parseQuery("group: day").group).toBe("day");
    expect(parseQuery("group: month").group).toBe("month");
    expect(parseQuery("group: year").group).toBe("year");
    expect(parseQuery("group: none").group).toBe("none");
  });

  it("rejects an unknown grouping and lists the choices", () => {
    expect(() => parseQuery("group: week")).toThrow(/`group`.*day, month, year, none/s);
  });

  it("accepts exactly the modes the shared lists declare", () => {
    // The lists are the source of the types, so this cannot fall out of step.
    for (const mode of GROUP_MODES) {
      expect(parseQuery(`group: ${mode}`).group, mode).toBe(mode);
    }
    for (const mode of DISPLAY_MODES) {
      expect(parseQuery(`display: ${mode}`).display, mode).toBe(mode);
    }
  });

  it("parses the display modes", () => {
    expect(parseQuery("display: full").display).toBe("full");
    expect(parseQuery("display: title").display).toBe("title");
  });

  it("rejects an unknown display mode", () => {
    expect(() => parseQuery("display: everything")).toThrow(/`display`.*full, preview, title/s);
  });

  it("parses positive integers", () => {
    const query = parseQuery("limit: 10\npreview-length: 80");
    expect(query.limit).toBe(10);
    expect(query.previewLength).toBe(80);
  });

  it("rejects a non-positive or non-integer number", () => {
    expect(() => parseQuery("limit: 0")).toThrow(/`limit` expects a whole number above zero/);
    expect(() => parseQuery("limit: -5")).toThrow(/`limit` expects a whole number above zero/);
    expect(() => parseQuery("limit: 2.5")).toThrow(/`limit` expects a whole number above zero/);
    expect(() => parseQuery("limit: many")).toThrow(/`limit` expects a whole number above zero/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/query/parse-scalars.test.ts`
Expected: FAIL — `title` and the other new fields report as unknown fields.

- [ ] **Step 3: Add the new cases to `applyField` in `src/query/parse.ts`**

Insert these cases immediately before `default:`:

```ts
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
      query.group = parseChoice(key, value, GROUP_MODES);
      return;
    case "display":
      query.display = parseChoice(key, value, DISPLAY_MODES);
      return;
    case "preview-length":
      query.previewLength = toPositiveInt(key, value);
      return;
    case "limit":
      query.limit = toPositiveInt(key, value);
      return;
```

- [ ] **Step 4: Extend the imports and append the helpers in `src/query/parse.ts`**

Task 7 left the file with three imports: `yaml`, `../engine/note` and `./types`.
Add a new import for `../engine/dates`, and replace the `./types` import with a
wider one. The `yaml` and `../engine/note` lines stay untouched. After this step
the import block reads:

```ts
import { parse as parseYamlText, YAMLParseError } from "yaml";
import { GROUP_MODES, parseDateExpr, type DateExpr } from "../engine/dates";
import { normalizeTag } from "../engine/note";
import { nearestField } from "./suggest";
import {
  DISPLAY_MODES,
  QueryError,
  QUERY_FIELDS,
  defaultQuery,
  type SortSpec,
  type StreamQuery,
  type TitleMatcher,
} from "./types";
```

`GroupMode` and `DisplayMode` are no longer imported: `parseChoice` is generic
over the choice list, so the types come from `GROUP_MODES` and `DISPLAY_MODES`
themselves rather than from a cast.

Append at the end of the file:

```ts
function toSingleString(field: string, value: unknown): string {
  if (typeof value === "string") {
    const text = value.trim();
    if (text === "") {
      // `title: ""` matches every note, so the field reads as a filter and
      // behaves as if it were absent. The list fields already reject this.
      throw new QueryError(`\`${field}\` is empty. Give it a value, or leave the field out.`);
    }
    return text;
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

/**
 * Generic on the choice list, so the returned type comes from the list itself.
 * A cast here would let the list and the union type drift: adding a mode to one
 * and not the other compiled clean and lied at runtime.
 */
function parseChoice<T extends string>(field: string, value: unknown, choices: readonly T[]): T {
  const text = toSingleString(field, value).toLowerCase();
  const match = choices.find((choice) => choice === text);
  if (match === undefined) {
    throw new QueryError(`\`${field}\` must be one of: ${choices.join(", ")}`);
  }
  return match;
}

function toPositiveInt(field: string, value: unknown): number {
  const n = typeof value === "number" ? value : Number(toSingleString(field, value));
  if (!Number.isInteger(n) || n <= 0) {
    throw new QueryError(`\`${field}\` expects a whole number above zero`);
  }
  return n;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/query/parse-scalars.test.ts tests/query/parse-lists.test.ts`
Expected: PASS, both files — 26 tests in `parse-scalars`, 22 in `parse-lists`.

- [ ] **Step 6: Commit**

```bash
git add src/query/parse.ts tests/query/parse-scalars.test.ts
git commit -m "feat: parse title, date bounds, sort, group and display fields"
```

---

### Task 9: Parsing `where` conditions

**Files:**
- Modify: `src/query/parse.ts` (one more case, plus helpers)
- Create: `tests/query/parse-where.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/query/parse-where.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseQuery } from "../../src/query/parse";

function whereOf(source: string) {
  return parseQuery(source).where;
}

describe("parseQuery — where", () => {
  it("reads a scalar as equality", () => {
    expect(whereOf("where:\n  status: done")).toEqual([
      { field: "status", condition: { kind: "equals", value: "done" } },
    ]);
  });

  it("keeps numbers and booleans as themselves", () => {
    expect(whereOf("where:\n  rating: 5\n  published: true")).toEqual([
      { field: "rating", condition: { kind: "equals", value: 5 } },
      { field: "published", condition: { kind: "equals", value: true } },
    ]);
  });

  it("reads a list as any-of", () => {
    expect(whereOf("where:\n  type: [article, book]")).toEqual([
      { field: "type", condition: { kind: "anyOf", values: ["article", "book"] } },
    ]);
  });

  it("reads exists and missing, case-insensitively", () => {
    expect(whereOf("where:\n  finished: exists\n  blocked: MISSING")).toEqual([
      { field: "finished", condition: { kind: "exists" } },
      { field: "blocked", condition: { kind: "missing" } },
    ]);
  });

  it("reads every comparison operator", () => {
    expect(whereOf('where:\n  a: ">3"\n  b: ">=3"\n  c: "<3"\n  d: "<=3"\n  e: "!=done"')).toEqual([
      { field: "a", condition: { kind: "compare", op: ">", operand: "3" } },
      { field: "b", condition: { kind: "compare", op: ">=", operand: "3" } },
      { field: "c", condition: { kind: "compare", op: "<", operand: "3" } },
      { field: "d", condition: { kind: "compare", op: "<=", operand: "3" } },
      { field: "e", condition: { kind: "compare", op: "!=", operand: "done" } },
    ]);
  });

  it("tolerates space after the operator", () => {
    expect(whereOf('where:\n  rating: "> 3"')).toEqual([
      { field: "rating", condition: { kind: "compare", op: ">", operand: "3" } },
    ]);
  });

  it("preserves the field name's case", () => {
    expect(whereOf("where:\n  Status: Done")).toEqual([
      { field: "Status", condition: { kind: "equals", value: "Done" } },
    ]);
  });

  it("rejects a where that is not a map", () => {
    expect(() => parseQuery("where: done")).toThrow(/`where` expects a map/);
    expect(() => parseQuery("where: [a, b]")).toThrow(/`where` expects a map/);
  });

  it("rejects a nested map as a condition", () => {
    expect(() => parseQuery("where:\n  status:\n    nested: 1")).toThrow(
      /`where.status` expects text, a number, a boolean, or a list/,
    );
  });

  it("rejects a comparison or a reserved word inside a list", () => {
    // A range is the first thing a user reaches for, and left alone this asks
    // for notes whose rating is the literal text ">3".
    expect(() => parseQuery('where:\n  rating: [">3", "<10"]')).toThrow(
      /`where.rating` cannot use `>3` inside a list/,
    );
    expect(() => parseQuery("where:\n  status: [exists, done]")).toThrow(
      /cannot use `exists` inside a list/,
    );
    expect(() => parseQuery("where:\n  status: [done, MISSING]")).toThrow(/inside a list/);
  });

  it("rejects an empty list, which could only ever match nothing", () => {
    // `tags: []` legally means no constraint. A named `where` field with no
    // values cannot mean that, so it is always a mistake.
    expect(() => parseQuery("where:\n  type: []")).toThrow(/`where.type` has no values to match/);
  });

  it("explains a missing value the way every other field does", () => {
    expect(() => parseQuery("where:\n  status: #idea")).toThrow(
      /`where.status` has no value.*as in status: "#book"/s,
    );
    expect(() => parseQuery("where:")).toThrow(/`where` has no value/);
  });

  it("rejects an operator with nothing to compare against", () => {
    // `">="` used to backtrack into `>` and compare against the string "=",
    // and `"> "` compared against nothing. Both silently matched the wrong notes.
    for (const value of ['">="', '"<="', '">"', '"!="', '"> "', '">   "']) {
      expect(() => parseQuery(`where:\n  rating: ${value}`), value).toThrow(
        /with nothing to compare against/,
      );
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/query/parse-where.test.ts`
Expected: FAIL — `where` reports as an unknown field.

- [ ] **Step 3: Add the `where` case to `applyField`**

Insert before `default:`:

```ts
    case "where":
      query.where = parseWhere(value);
      return;
```

- [ ] **Step 4: Add the types to the `./types` import and append the helpers**

Add `type CompareOp`, `type WhereClause` and `type WhereCondition` to the existing import from `./types`, then append:

```ts
/**
 * `.*` rather than `.+` on purpose. With `.+`, `">="` backtracked into the `>`
 * branch and compared against the string `"="`, and `"> "` compared against
 * nothing — both in silence. Matching greedily and rejecting an empty operand
 * turns all of those into one clear error.
 */
const COMPARISON = /^(>=|<=|!=|>|<)\s*(.*)$/;
const RESERVED = new Set(["exists", "missing"]);

function parseWhere(value: unknown): WhereClause[] {
  if (value === null || value === undefined) {
    throw new QueryError(
      "`where` has no value. Give it at least one `field: condition` line, or leave it out.",
    );
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new QueryError("`where` expects a map of `field: condition` entries");
  }
  return Object.entries(value as Record<string, unknown>).map(([field, raw]) => ({
    field,
    condition: parseCondition(field, raw),
  }));
}

function parseCondition(field: string, raw: unknown): WhereCondition {
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      throw new QueryError(
        `\`where.${field}\` has no values to match. Give it at least one, or leave the field out.`,
      );
    }
    return { kind: "anyOf", values: raw.map((item) => asAnyOfValue(field, item)) };
  }

  if (typeof raw === "string") {
    const text = raw.trim();
    if (text.toLowerCase() === "exists") {
      return { kind: "exists" };
    }
    if (text.toLowerCase() === "missing") {
      return { kind: "missing" };
    }
    const comparison = COMPARISON.exec(text);
    if (comparison) {
      const operand = comparison[2].trim();
      if (operand === "") {
        throw new QueryError(
          `\`where.${field}\` has the operator \`${comparison[1]}\` with nothing to compare against`,
        );
      }
      return { kind: "compare", op: comparison[1] as CompareOp, operand };
    }
    return { kind: "equals", value: text };
  }

  return { kind: "equals", value: asScalar(field, raw) };
}

/**
 * A list is any-of and nothing else. A comparison or a reserved word inside one
 * loses its meaning in silence: `rating: [">3", "<10"]` is how a user reaches
 * for a range, and unchecked it asks for notes whose rating is the literal text
 * `">3"`, matching nothing.
 */
function asAnyOfValue(field: string, item: unknown): string | number | boolean {
  const value = asScalar(field, item);
  if (typeof value === "string") {
    const text = value.trim();
    if (COMPARISON.test(text) || RESERVED.has(text.toLowerCase())) {
      throw new QueryError(
        `\`where.${field}\` cannot use \`${text}\` inside a list. A list means "any of these values"; a comparison or \`exists\`/\`missing\` has to be the whole condition.`,
      );
    }
  }
  return value;
}

function asScalar(field: string, value: unknown): string | number | boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value === null || value === undefined) {
    // The same answer every other field gives, so `where: { status: #idea }`
    // and `tags: #idea` explain the same mistake to the same standard.
    throw new QueryError(`\`where.${field}\` has no value. ${hashHint(field)}`);
  }
  throw new QueryError(
    `\`where.${field}\` expects text, a number, a boolean, or a list of them`,
  );
}
```

- [ ] **Step 5: Tie `applyField` to `QUERY_FIELDS` at compile time**

The switch is complete as of this task, so lock the two lists together. Until
now nothing connected them, and the gap was visible: `sort: date desc` reported
``Unknown field `sort`. Did you mean `sort`?`` — advertising a field as valid in
the same breath as rejecting it. A field listed and unhandled, or handled and
unlisted, must now fail to compile rather than reach a user.

Replace `applyField`'s signature and `default` branch:

```ts
function applyField(query: StreamQuery, key: string, value: unknown): void {
  if (!isQueryField(key)) {
    throw unknownField(key);
  }
  switch (key) {
    // ... every existing case, unchanged ...
    default:
      return assertNever(key);
  }
}

function isQueryField(key: string): key is (typeof QUERY_FIELDS)[number] {
  return (QUERY_FIELDS as readonly string[]).includes(key);
}

/** Unreachable. A QUERY_FIELDS entry with no case makes this fail to compile. */
function assertNever(field: never): never {
  throw new Error(`Unhandled query field: ${String(field)}`);
}
```

Then add a round-trip test to `tests/query/parse-where.test.ts`, which is the
last parser test file, so the guard is regression-proof at runtime too:

```ts
import { QUERY_FIELDS } from "../../src/query/types";

/** A smallest valid value for each field, to prove the field is wired up. */
const MINIMAL: Record<(typeof QUERY_FIELDS)[number], string> = {
  folder: "Journal",
  tags: "book",
  "tags-any": "book",
  "exclude-folder": "Archive",
  "exclude-tags": "draft",
  title: "weekly",
  where: "\n  status: done",
  "date-field": "date",
  from: "2026-01-01",
  to: "today",
  sort: "date desc",
  group: "day",
  display: "full",
  "preview-length": "80",
  limit: "10",
};

describe("parseQuery — every advertised field is wired up", () => {
  it("accepts each field in QUERY_FIELDS", () => {
    for (const field of QUERY_FIELDS) {
      expect(() => parseQuery(`${field}: ${MINIMAL[field]}`), field).not.toThrow();
    }
  });
});
```

Run: `npx vitest run tests/query/parse-where.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 6: Run the whole suite so far**

Run: `npm test`
Expected: PASS — every test file green. The parser is now complete.

- [ ] **Step 7: Commit**

```bash
git add src/query/parse.ts tests/query/parse-where.test.ts
git commit -m "feat: parse where conditions"
```

---
### Task 10: Filtering by folder, tag and title

**Files:**
- Create: `src/engine/filter.ts`
- Create: `tests/engine/filter-basics.test.ts`

Two boundary rules carry most of the risk here: a folder prefix must break on a `/` so `Journal2` never matches `Journal`, and a tag must match its own descendants so `project` catches `project/streams`.

- [ ] **Step 1: Write the failing test**

`tests/engine/filter-basics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterNotes, hasTag, inFolder, matchesTitle } from "../../src/engine/filter";
import { parseQuery } from "../../src/query/parse";
import { note } from "../fixtures/notes";

const NOW = new Date(2026, 8, 4);

function pathsOf(source: string, notes = SAMPLE) {
  return filterNotes(notes, parseQuery(source), NOW).map((n) => n.path);
}

const SAMPLE = [
  note({ path: "Journal/2026-09-04.md", tags: ["daily"] }),
  note({ path: "Journal/Trips/lisbon.md", tags: ["travel"] }),
  note({ path: "Journal2/other.md", tags: ["daily"] }),
  note({ path: "Books/dune.md", tags: ["book", "scifi"] }),
  note({ path: "Books/draft-idea.md", tags: ["book", "draft"] }),
  note({ path: "Projects/streams.md", tags: ["project/simple-streams"] }),
];

describe("inFolder", () => {
  it("matches the folder itself and its descendants", () => {
    expect(inFolder("Journal/2026-09-04.md", "journal")).toBe(true);
    expect(inFolder("Journal/Trips/lisbon.md", "journal")).toBe(true);
    expect(inFolder("Journal/Trips/lisbon.md", "journal/trips")).toBe(true);
  });

  it("does not match a folder that merely starts with the same letters", () => {
    expect(inFolder("Journal2/other.md", "journal")).toBe(false);
  });

  it("matches everything for an empty prefix", () => {
    expect(inFolder("Books/dune.md", "")).toBe(true);
  });

  it("normalizes both of its arguments, so a hand-built query still works", () => {
    expect(inFolder("Journal/2026-09-04.md", "Journal")).toBe(true);
    expect(inFolder("Journal/2026-09-04.md", "/Journal/")).toBe(true);
    expect(inFolder("/Journal/2026-09-04.md", "journal")).toBe(true);
  });
});

describe("hasTag", () => {
  it("matches the tag itself", () => {
    expect(hasTag(["book"], "book")).toBe(true);
  });

  it("matches a descendant tag", () => {
    expect(hasTag(["project/simple-streams"], "project")).toBe(true);
  });

  it("does not match a sibling that shares a prefix", () => {
    expect(hasTag(["bookmark"], "book")).toBe(false);
  });

  it("normalizes both of its arguments", () => {
    expect(hasTag(["book"], "#Book")).toBe(true);
    expect(hasTag(["project/streams"], "#Project")).toBe(true);
    expect(hasTag(["Book"], "book")).toBe(true);
    expect(hasTag(["#Project/Streams"], "project")).toBe(true);
  });
});

describe("matchesTitle", () => {
  it("matches a case-insensitive substring", () => {
    expect(matchesTitle(note({ path: "Journal/2026-09-04.md" }), { kind: "text", value: "2026-" })).toBe(true);
    expect(matchesTitle(note({ path: "Books/Dune.md" }), { kind: "text", value: "dune" })).toBe(true);
  });

  it("matches a regex", () => {
    expect(matchesTitle(note({ path: "J/2026-09-04.md" }), { kind: "regex", source: "^20\\d\\d-", flags: "" })).toBe(true);
    expect(matchesTitle(note({ path: "J/lisbon.md" }), { kind: "regex", source: "^20\\d\\d-", flags: "" })).toBe(false);
  });

  it("matches everything when there is no matcher", () => {
    expect(matchesTitle(note(), null)).toBe(true);
  });
});

describe("filterNotes", () => {
  it("returns everything for an empty query", () => {
    expect(pathsOf("")).toHaveLength(SAMPLE.length);
  });

  it("filters by folder without catching a same-prefix sibling", () => {
    expect(pathsOf("folder: Journal")).toEqual([
      "Journal/2026-09-04.md",
      "Journal/Trips/lisbon.md",
    ]);
  });

  it("accepts several folders", () => {
    expect(pathsOf("folder: [Books, Projects]")).toEqual([
      "Books/dune.md",
      "Books/draft-idea.md",
      "Projects/streams.md",
    ]);
  });

  it("requires every tag in `tags`", () => {
    expect(pathsOf("tags: [book, scifi]")).toEqual(["Books/dune.md"]);
  });

  it("accepts any tag in `tags-any`", () => {
    expect(pathsOf("tags-any: [travel, scifi]")).toEqual([
      "Journal/Trips/lisbon.md",
      "Books/dune.md",
    ]);
  });

  it("matches an ancestor tag", () => {
    expect(pathsOf("tags: project")).toEqual(["Projects/streams.md"]);
  });

  it("drops excluded folders and tags", () => {
    expect(pathsOf("tags: book\nexclude-tags: draft")).toEqual(["Books/dune.md"]);
    expect(pathsOf("exclude-folder: [Journal, Journal2, Books]")).toEqual(["Projects/streams.md"]);
  });

  it("combines a folder and a title match", () => {
    expect(pathsOf("folder: Journal\ntitle: 2026-")).toEqual(["Journal/2026-09-04.md"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/filter-basics.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/filter`.

- [ ] **Step 3: Write the implementation**

`src/engine/filter.ts`. Task 11 replaces the `where`/date placeholder lines in `filterNotes`; everything else here is final.

```ts
import { resolveDateExpr } from "./dates";
import { resolveNoteDate } from "./fields";
import { normalizeTag } from "./note";
import type { NoteMeta } from "./note";
import type { StreamQuery, TitleMatcher } from "../query/types";

/**
 * Path prefix match that breaks on a slash, so "journal" never matches
 * "Journal2". Normalizes its own argument rather than trusting the caller: the
 * parser already lower-cases and trims slashes, but a StreamQuery built by hand
 * with `folder: ["Journal"]` would otherwise match nothing, in silence.
 */
export function inFolder(path: string, folder: string): boolean {
  const wanted = trimSlashes(folder);
  if (wanted === "") {
    return true;
  }
  // The path gets the same treatment. A NoteMeta path is vault-relative and so
  // has no leading slash, but this function is exported and normalizing only
  // one of its two arguments is the kind of asymmetry that bites later.
  const lower = trimSlashes(path);
  return lower === wanted || lower.startsWith(`${wanted}/`);
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
}

/**
 * A tag matches itself and its descendants: "project" matches
 * "project/streams". Normalizes its own argument, for the same reason.
 */
export function hasTag(tags: string[], wanted: string): boolean {
  const needle = normalizeTag(wanted);
  // Both sides again. A NoteMeta's tags arrive normalized from the adapter, but
  // nothing enforces that, and an unnormalized tag would drop its note out of
  // every tag query in silence — the same asymmetry inFolder had.
  return tags.some((tag) => {
    const held = normalizeTag(tag);
    return held === needle || held.startsWith(`${needle}/`);
  });
}

export function matchesTitle(note: NoteMeta, matcher: TitleMatcher | null): boolean {
  if (matcher === null) {
    return true;
  }
  if (matcher.kind === "regex") {
    // Compiled per note rather than hoisted, so TitleMatcher stays plain data.
    // Hoisting would also be wrong, not merely different: a `g`-flagged regex
    // carries `lastIndex` between calls, so one shared instance returns true
    // then false for the same string, and titles would match or not depending
    // on their position in the list. The timing says the same thing — 5000
    // notes cost 1.69ms this way against 0.24ms compiled once, which is
    // nothing beside the view's 300ms refresh debounce.
    return new RegExp(matcher.source, matcher.flags).test(note.basename);
  }
  return note.basename.toLowerCase().includes(matcher.value);
}

/**
 * Query terms are re-normalized per note rather than hoisted, matching the
 * choice made in matchesTitle and for the same measured reason. On 5000 notes
 * with five folders, five any-tags and four exclusions, 200 iterations per
 * trial, this costs 5.1-5.4ms — about 1.7% of the view's 300ms refresh
 * debounce. Hoisting every term and every note's tags is roughly three times
 * faster; two independent runs put the ratio at 2.8x and 3.3x, the spread
 * coming from how much one hoists. The cost, not the ratio, is what decides it:
 * revisit only if a measurement puts it near that budget.
 */
export function filterNotes(notes: NoteMeta[], query: StreamQuery, now: Date): NoteMeta[] {
  const from = query.from === null ? null : resolveDateExpr(query.from, now, "start");
  const to = query.to === null ? null : resolveDateExpr(query.to, now, "end");

  return notes.filter((note) => {
    if (query.folder.length > 0 && !query.folder.some((folder) => inFolder(note.path, folder))) {
      return false;
    }
    if (query.excludeFolder.some((folder) => inFolder(note.path, folder))) {
      return false;
    }
    if (!query.tags.every((tag) => hasTag(note.tags, tag))) {
      return false;
    }
    if (query.tagsAny.length > 0 && !query.tagsAny.some((tag) => hasTag(note.tags, tag))) {
      return false;
    }
    if (query.excludeTags.some((tag) => hasTag(note.tags, tag))) {
      return false;
    }
    if (!matchesTitle(note, query.title)) {
      return false;
    }
    if (from !== null || to !== null) {
      const date = resolveNoteDate(note, query.dateField);
      if (from !== null && date < from) {
        return false;
      }
      if (to !== null && date > to) {
        return false;
      }
    }
    return true;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/filter-basics.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/filter.ts tests/engine/filter-basics.test.ts
git commit -m "feat: filter notes by folder, tag and title"
```

---

### Task 11: Filtering by `where` and date range

**Files:**
- Modify: `src/engine/filter.ts` (add the `where` check to `filterNotes`, append helpers)
- Create: `tests/engine/filter-where.test.ts`

The rule worth stating twice: **an absent field matches only `missing`.** It fails equality, any-of and every comparison, `!=` included. A field with no value is not a value.

- [ ] **Step 1: Write the failing test**

`tests/engine/filter-where.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterNotes, matchesClause } from "../../src/engine/filter";
import { parseQuery } from "../../src/query/parse";
import { localDate, note } from "../fixtures/notes";

const NOW = new Date(2026, 8, 4, 12, 0);

function condition(source: string) {
  return parseQuery(source).where[0];
}

describe("matchesClause — equality and any-of", () => {
  it("compares strings case-insensitively", () => {
    const n = note({ frontmatter: { status: "Done" } });
    expect(matchesClause(n, condition("where:\n  status: done"))).toBe(true);
  });

  it("compares numbers numerically across string and number values", () => {
    expect(matchesClause(note({ frontmatter: { rating: 5 } }), condition("where:\n  rating: 5"))).toBe(true);
    expect(matchesClause(note({ frontmatter: { rating: "5" } }), condition("where:\n  rating: 5"))).toBe(true);
    expect(matchesClause(note({ frontmatter: { rating: 4 } }), condition("where:\n  rating: 5"))).toBe(false);
  });

  it("compares booleans", () => {
    expect(matchesClause(note({ frontmatter: { published: true } }), condition("where:\n  published: true"))).toBe(true);
    expect(matchesClause(note({ frontmatter: { published: false } }), condition("where:\n  published: true"))).toBe(false);
  });

  it("matches any listed value", () => {
    const clause = condition("where:\n  type: [article, book]");
    expect(matchesClause(note({ frontmatter: { type: "book" } }), clause)).toBe(true);
    expect(matchesClause(note({ frontmatter: { type: "video" } }), clause)).toBe(false);
  });

  it("matches when any element of an array-valued field matches", () => {
    const n = note({ frontmatter: { type: ["video", "book"] } });
    expect(matchesClause(n, condition("where:\n  type: book"))).toBe(true);
    expect(matchesClause(n, condition("where:\n  type: [book, article]"))).toBe(true);
  });
});

describe("matchesClause — exists and missing", () => {
  it("detects a present field", () => {
    expect(matchesClause(note({ frontmatter: { done: "yes" } }), condition("where:\n  done: exists"))).toBe(true);
    expect(matchesClause(note(), condition("where:\n  done: exists"))).toBe(false);
  });

  it("treats null as missing", () => {
    expect(matchesClause(note({ frontmatter: { done: null } }), condition("where:\n  done: missing"))).toBe(true);
    expect(matchesClause(note({ frontmatter: { done: null } }), condition("where:\n  done: exists"))).toBe(false);
  });

  it("detects an absent field", () => {
    expect(matchesClause(note(), condition("where:\n  done: missing"))).toBe(true);
  });
});

describe("matchesClause — comparisons", () => {
  it("compares numbers", () => {
    const clause = condition('where:\n  rating: ">3"');
    expect(matchesClause(note({ frontmatter: { rating: 4 } }), clause)).toBe(true);
    expect(matchesClause(note({ frontmatter: { rating: 3 } }), clause)).toBe(false);
    expect(matchesClause(note({ frontmatter: { rating: "4" } }), clause)).toBe(true);
  });

  it("honours >= and <=", () => {
    expect(matchesClause(note({ frontmatter: { r: 3 } }), condition('where:\n  r: ">=3"'))).toBe(true);
    expect(matchesClause(note({ frontmatter: { r: 3 } }), condition('where:\n  r: "<=3"'))).toBe(true);
    expect(matchesClause(note({ frontmatter: { r: 4 } }), condition('where:\n  r: "<=3"'))).toBe(false);
  });

  it("compares ISO dates chronologically", () => {
    const clause = condition('where:\n  due: ">2026-06-01"');
    expect(matchesClause(note({ frontmatter: { due: "2026-09-04" } }), clause)).toBe(true);
    expect(matchesClause(note({ frontmatter: { due: "2026-01-04" } }), clause)).toBe(false);
  });

  it("compares plain text lexically, never as a date", () => {
    // Date.parse("May") succeeds in some runtimes. Comparison must stay textual,
    // so "May" > "June" alphabetically even though May precedes June in the year.
    const clause = condition('where:\n  month: ">June"');
    expect(matchesClause(note({ frontmatter: { month: "May" } }), clause)).toBe(true);
    expect(matchesClause(note({ frontmatter: { month: "April" } }), clause)).toBe(false);
  });

  it("supports != on text", () => {
    const clause = condition('where:\n  status: "!=done"');
    expect(matchesClause(note({ frontmatter: { status: "todo" } }), clause)).toBe(true);
    expect(matchesClause(note({ frontmatter: { status: "done" } }), clause)).toBe(false);
  });

  it("fails every comparison for an absent field, != included", () => {
    expect(matchesClause(note(), condition('where:\n  status: "!=done"'))).toBe(false);
    expect(matchesClause(note(), condition('where:\n  rating: ">3"'))).toBe(false);
    expect(matchesClause(note(), condition("where:\n  rating: 3"))).toBe(false);
  });

  it("compares against file properties", () => {
    const n = note({ path: "Journal/a.md" });
    expect(matchesClause(n, condition("where:\n  file.path: Journal/a.md"))).toBe(true);
  });
});

describe("filterNotes — date range", () => {
  const notes = [
    note({ path: "a.md", frontmatter: { date: "2026-01-15" } }),
    note({ path: "b.md", frontmatter: { date: "2026-09-04" } }),
    note({ path: "c.md", frontmatter: { date: "2026-12-31" } }),
    note({ path: "d.md", ctime: localDate(2026, 6, 1) }),
  ];

  it("filters on the named date field", () => {
    const query = parseQuery("date-field: date\nfrom: 2026-02-01\nto: 2026-10-01");
    expect(filterNotes(notes, query, NOW).map((n) => n.path)).toEqual(["b.md"]);
  });

  it("includes both bounds as whole days", () => {
    const query = parseQuery("date-field: date\nfrom: 2026-09-04\nto: 2026-09-04");
    expect(filterNotes(notes, query, NOW).map((n) => n.path)).toEqual(["b.md"]);
  });

  it("falls back to ctime for a note without the date field", () => {
    const query = parseQuery("date-field: date\nfrom: 2026-05-01\nto: 2026-07-01");
    expect(filterNotes(notes, query, NOW).map((n) => n.path)).toEqual(["d.md"]);
  });

  it("resolves relative bounds against the given now", () => {
    const query = parseQuery("date-field: date\nfrom: -30d\nto: today");
    expect(filterNotes(notes, query, NOW).map((n) => n.path)).toEqual(["b.md"]);
  });

  it("applies an open-ended lower bound", () => {
    const query = parseQuery("date-field: date\nfrom: 2026-10-01");
    expect(filterNotes(notes, query, NOW).map((n) => n.path)).toEqual(["c.md"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/filter-where.test.ts`
Expected: FAIL — `matchesClause` is not exported.

- [ ] **Step 3: Add the `where` check to `filterNotes`**

Insert immediately after the `matchesTitle` check:

```ts
    if (!query.where.every((clause) => matchesClause(note, clause))) {
      return false;
    }
```

- [ ] **Step 4: Append the comparison helpers to `src/engine/filter.ts`**

Extend the `./dates` import to `import { dateValue, resolveDateExpr } from "./dates";`, extend the `./fields` import to `import { resolveField, resolveNoteDate } from "./fields";`, and add `type CompareOp, type WhereClause` to the `../query/types` import. Then append:

```ts
export function matchesClause(note: NoteMeta, clause: WhereClause): boolean {
  const raw = resolveField(note, clause.field);
  const condition = clause.condition;

  if (condition.kind === "exists") {
    return raw !== undefined && raw !== null;
  }
  if (condition.kind === "missing") {
    return raw === undefined || raw === null;
  }
  // An absent field is not a value: it fails equality, any-of and every
  // comparison, including "!=".
  if (raw === undefined || raw === null) {
    return false;
  }

  const values = Array.isArray(raw) ? raw : [raw];
  switch (condition.kind) {
    case "equals":
      return values.some((value) => scalarEquals(value, condition.value));
    case "anyOf":
      return values.some((value) =>
        condition.values.some((wanted) => scalarEquals(value, wanted)),
      );
    case "compare":
      return values.some((value) => compareValue(value, condition.op, condition.operand));
  }
}

function scalarEquals(left: unknown, right: string | number | boolean): boolean {
  if (typeof right === "number") {
    const asNumber = toNumber(left);
    return asNumber !== null && asNumber === right;
  }
  if (typeof right === "boolean") {
    return typeof left === "boolean" ? left === right : String(left).toLowerCase() === String(right);
  }
  return String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
}

function compareValue(left: unknown, op: CompareOp, operand: string): boolean {
  const order = compareOrder(left, operand);
  switch (op) {
    case ">":
      return order > 0;
    case ">=":
      return order >= 0;
    case "<":
      return order < 0;
    case "<=":
      return order <= 0;
    case "!=":
      return order !== 0;
  }
}

/** Negative, zero or positive, comparing as numbers, then dates, then text. */
function compareOrder(left: unknown, operand: string): number {
  const leftNumber = toNumber(left);
  const rightNumber = toNumber(operand);
  if (leftNumber !== null && rightNumber !== null) {
    return Math.sign(leftNumber - rightNumber);
  }

  const leftDate = dateValue(left);
  const rightDate = dateValue(operand);
  if (leftDate !== null && rightDate !== null) {
    return Math.sign(leftDate - rightDate);
  }

  return String(left).trim().toLowerCase().localeCompare(String(operand).trim().toLowerCase());
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/engine/filter-where.test.ts tests/engine/filter-basics.test.ts`
Expected: PASS, both files.

- [ ] **Step 6: Commit**

```bash
git add src/engine/filter.ts tests/engine/filter-where.test.ts
git commit -m "feat: filter notes by where conditions and date range"
```

---

### Task 12: Sorting

**Files:**
- Create: `src/engine/sort.ts`
- Create: `tests/engine/sort.test.ts`

Two rules the engineer must not "improve": missing values sort last in **both** directions, and ties break on `file.path` ascending so a re-render never reshuffles equal rows.

- [ ] **Step 1: Write the failing test**

`tests/engine/sort.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sortNotes } from "../../src/engine/sort";
import { localDate, note } from "../fixtures/notes";

function pathsOf(notes: ReturnType<typeof note>[], sort: { field: string; direction: "asc" | "desc" }[]) {
  return sortNotes(notes, sort).map((n) => n.path);
}

describe("sortNotes", () => {
  it("sorts numbers numerically, not lexically", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { rating: 9 } }),
      note({ path: "b.md", frontmatter: { rating: 10 } }),
      note({ path: "c.md", frontmatter: { rating: 2 } }),
    ];
    expect(pathsOf(notes, [{ field: "rating", direction: "asc" }])).toEqual(["c.md", "a.md", "b.md"]);
  });

  it("sorts ISO dates chronologically", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { date: "2026-01-15" } }),
      note({ path: "b.md", frontmatter: { date: "2026-09-04" } }),
      note({ path: "c.md", frontmatter: { date: "2025-12-31" } }),
    ];
    expect(pathsOf(notes, [{ field: "date", direction: "desc" }])).toEqual(["b.md", "a.md", "c.md"]);
  });

  it("sorts text case-insensitively", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { title: "banana" } }),
      note({ path: "b.md", frontmatter: { title: "Apple" } }),
    ];
    expect(pathsOf(notes, [{ field: "title", direction: "asc" }])).toEqual(["b.md", "a.md"]);
  });

  it("puts missing values last when ascending", () => {
    const notes = [
      note({ path: "a.md" }),
      note({ path: "b.md", frontmatter: { rating: 1 } }),
    ];
    expect(pathsOf(notes, [{ field: "rating", direction: "asc" }])).toEqual(["b.md", "a.md"]);
  });

  it("puts missing values last when descending too", () => {
    const notes = [
      note({ path: "a.md" }),
      note({ path: "b.md", frontmatter: { rating: 1 } }),
    ];
    expect(pathsOf(notes, [{ field: "rating", direction: "desc" }])).toEqual(["b.md", "a.md"]);
  });

  it("treats an empty string as missing", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { status: "" } }),
      note({ path: "b.md", frontmatter: { status: "todo" } }),
    ];
    expect(pathsOf(notes, [{ field: "status", direction: "asc" }])).toEqual(["b.md", "a.md"]);
  });

  it("applies sort keys in order", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { group: "x", rating: 1 } }),
      note({ path: "b.md", frontmatter: { group: "x", rating: 9 } }),
      note({ path: "c.md", frontmatter: { group: "a", rating: 5 } }),
    ];
    expect(
      pathsOf(notes, [
        { field: "group", direction: "asc" },
        { field: "rating", direction: "desc" },
      ]),
    ).toEqual(["c.md", "b.md", "a.md"]);
  });

  it("breaks ties on path ascending, so order is stable", () => {
    const notes = [
      note({ path: "z.md", frontmatter: { rating: 1 } }),
      note({ path: "a.md", frontmatter: { rating: 1 } }),
    ];
    expect(pathsOf(notes, [{ field: "rating", direction: "desc" }])).toEqual(["a.md", "z.md"]);
  });

  it("sorts by file properties", () => {
    const notes = [
      note({ path: "a.md", ctime: localDate(2026, 1, 1) }),
      note({ path: "b.md", ctime: localDate(2026, 9, 4) }),
    ];
    expect(pathsOf(notes, [{ field: "file.ctime", direction: "desc" }])).toEqual(["b.md", "a.md"]);
  });

  it("does not mutate the input array", () => {
    const notes = [note({ path: "b.md" }), note({ path: "a.md" })];
    sortNotes(notes, [{ field: "file.name", direction: "asc" }]);
    expect(notes.map((n) => n.path)).toEqual(["b.md", "a.md"]);
  });

  it("does not treat a plain word as a date", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { month: "May" } }),
      note({ path: "b.md", frontmatter: { month: "April" } }),
    ];
    expect(pathsOf(notes, [{ field: "month", direction: "asc" }])).toEqual(["b.md", "a.md"]);
  });

  it("keeps a plain year beside an ISO date instead of fifty-six years away", () => {
    // A timestamp conversion compared 2026 — two seconds into 1970 — against
    // 2026-01-01. ISO text already sorts chronologically.
    const notes = [
      note({ path: "iso.md", frontmatter: { year: "2026-01-01" } }),
      note({ path: "num.md", frontmatter: { year: 2026 } }),
      note({ path: "later.md", frontmatter: { year: "2027-01-01" } }),
    ];
    expect(pathsOf(notes, [{ field: "year", direction: "asc" }])).toEqual([
      "num.md",
      "iso.md",
      "later.md",
    ]);
  });

  it("does not read a hex-looking value as a number", () => {
    // As text "0x10" collates before "5"; as a number it would be 16 and follow.
    const notes = [
      note({ path: "a.md", frontmatter: { id: "0x10" } }),
      note({ path: "b.md", frontmatter: { id: "5" } }),
    ];
    expect(pathsOf(notes, [{ field: "id", direction: "asc" }])).toEqual(["a.md", "b.md"]);
  });

  it("orders text by the locale it is given", () => {
    // The host default puts these the other way round, which is the point.
    const notes = [
      note({ path: "a.md", frontmatter: { t: "ıyı" } }),
      note({ path: "b.md", frontmatter: { t: "Iyi" } }),
    ];
    expect(sortNotes(notes, [{ field: "t", direction: "asc" }], "tr").map((n) => n.path)).toEqual([
      "a.md",
      "b.md",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/sort.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/sort`.

- [ ] **Step 3: Write the implementation**

`src/engine/sort.ts`:

```ts
import { resolveField } from "./fields";
import type { NoteMeta } from "./note";
import type { SortSpec } from "../query/types";

const DECIMAL = /^[+-]?\d+(\.\d+)?$/;

/**
 * `locale` is threaded rather than pinned, matching formatGroupHeader, so a
 * Turkish or Swedish user sorts their own notes in their own alphabet and a
 * test can still fix an order. Left undefined it follows the host.
 */
export function sortNotes(notes: NoteMeta[], sort: SortSpec[], locale?: string): NoteMeta[] {
  return [...notes].sort((a, b) => {
    for (const spec of sort) {
      const order = compareBySpec(a, b, spec, locale);
      if (order !== 0) {
        return order;
      }
    }
    // Stable tie-break, so equal rows keep their order across re-renders. It is
    // the hot path when nothing resolves the sort field, since then every pair
    // ties: measured at 2.0ms for 5000 notes and 4.2ms for 10000 against 0.7ms
    // and 1.4ms for a plain `<`. Three times slower, and 0.7% of the view's
    // 300ms refresh debounce.
    return a.path.localeCompare(b.path, locale);
  });
}

function compareBySpec(a: NoteMeta, b: NoteMeta, spec: SortSpec, locale?: string): number {
  const left = comparable(resolveField(a, spec.field));
  const right = comparable(resolveField(b, spec.field));

  // Missing values sort last regardless of direction: a note with no rating
  // should not lead a "rating desc" stream nor a "rating asc" one.
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }

  const order =
    typeof left === "number" && typeof right === "number"
      ? Math.sign(left - right)
      : String(left).localeCompare(String(right), locale, {
          numeric: true,
          sensitivity: "base",
        });

  return spec.direction === "desc" ? -order : order;
}

/**
 * Reduce a field value to a number or a string, or null when there is nothing
 * to sort on.
 *
 * An ISO date is deliberately left as text: ISO-8601 already sorts
 * chronologically under numeric collation, and converting it to a timestamp put
 * it on the same axis as ordinary numbers — a `year: 2026` field landed about
 * fifty-six years from a `year: "2026-01-01"` one, because 2026 as a timestamp
 * is two seconds into 1970. Only a decimal numeral becomes a number, so a
 * hex-looking `id: "0x10"` stays the text it looks like rather than becoming 16.
 */
function comparable(value: unknown): number | string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (value instanceof Date) {
    // As an ISO day, so a Date and an ISO string sort together.
    return Number.isNaN(value.getTime()) ? null : isoDay(value);
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? comparable(value[0]) : null;
  }

  const text = String(value).trim();
  if (text === "") {
    return null;
  }
  return DECIMAL.test(text) ? Number(text) : text.toLowerCase();
}

function isoDay(date: Date): string {
  const pad = (part: number): string => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/sort.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/sort.ts tests/engine/sort.test.ts
git commit -m "feat: sort notes with missing values last and stable ties"
```

---

### Task 13: Grouping

**Files:**
- Create: `src/engine/group.ts`
- Create: `tests/engine/group.test.ts`

Groups come from item-to-item transitions, not from bucketing. That is deliberate: sorting by something other than the date field then produces a repeated header, which is faithful to the order on screen.

- [ ] **Step 1: Write the failing test**

`tests/engine/group.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupNotes } from "../../src/engine/group";
import { parseQuery } from "../../src/query/parse";
import { localDate, note } from "../fixtures/notes";

describe("groupNotes", () => {
  it("returns a single headerless group when grouping is off", () => {
    const notes = [note({ path: "a.md" }), note({ path: "b.md" })];
    const groups = groupNotes(notes, parseQuery(""), "en-GB");
    expect(groups).toHaveLength(1);
    expect(groups[0].header).toBeNull();
    expect(groups[0].notes.map((n) => n.path)).toEqual(["a.md", "b.md"]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupNotes([], parseQuery("group: day"), "en-GB")).toEqual([]);
  });

  it("groups consecutive notes from the same day", () => {
    const notes = [
      note({ path: "a.md", ctime: localDate(2026, 9, 4) }),
      note({ path: "b.md", ctime: localDate(2026, 9, 4) }),
      note({ path: "c.md", ctime: localDate(2026, 9, 3) }),
    ];
    const groups = groupNotes(notes, parseQuery("group: day"), "en-GB");
    expect(groups.map((g) => g.header)).toEqual(["4 September 2026", "3 September 2026"]);
    expect(groups[0].notes.map((n) => n.path)).toEqual(["a.md", "b.md"]);
  });

  it("groups by month across a month boundary", () => {
    const notes = [
      note({ path: "a.md", ctime: localDate(2026, 9, 1) }),
      note({ path: "b.md", ctime: localDate(2026, 8, 31) }),
    ];
    const groups = groupNotes(notes, parseQuery("group: month"), "en-GB");
    expect(groups.map((g) => g.header)).toEqual(["September 2026", "August 2026"]);
  });

  it("groups by year across a year boundary", () => {
    const notes = [
      note({ path: "a.md", ctime: localDate(2027, 1, 1) }),
      note({ path: "b.md", ctime: localDate(2026, 12, 31) }),
    ];
    const groups = groupNotes(notes, parseQuery("group: year"), "en-GB");
    expect(groups.map((g) => g.header)).toEqual(["2027", "2026"]);
  });

  it("uses the named date field", () => {
    const notes = [
      note({ path: "a.md", frontmatter: { date: "2026-03-02" }, ctime: localDate(2020, 1, 1) }),
    ];
    const groups = groupNotes(notes, parseQuery("date-field: date\ngroup: day"), "en-GB");
    expect(groups[0].header).toBe("2 March 2026");
  });

  it("repeats a header when the order revisits a day", () => {
    const notes = [
      note({ path: "a.md", ctime: localDate(2026, 9, 4) }),
      note({ path: "b.md", ctime: localDate(2026, 9, 3) }),
      note({ path: "c.md", ctime: localDate(2026, 9, 4) }),
    ];
    const groups = groupNotes(notes, parseQuery("group: day"), "en-GB");
    expect(groups.map((g) => g.header)).toEqual([
      "4 September 2026",
      "3 September 2026",
      "4 September 2026",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/group.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/group`.

- [ ] **Step 3: Write the implementation**

`src/engine/group.ts`:

```ts
import { formatGroupHeader, groupKey } from "./dates";
import { resolveNoteDate } from "./fields";
import type { NoteMeta } from "./note";
import type { StreamQuery } from "../query/types";

export interface StreamGroup {
  key: string;
  /** null when grouping is off, so the view knows to render no header. */
  header: string | null;
  notes: NoteMeta[];
}

export function groupNotes(
  notes: NoteMeta[],
  query: StreamQuery,
  locale?: string,
): StreamGroup[] {
  if (notes.length === 0) {
    return [];
  }
  if (query.group === "none") {
    return [{ key: "", header: null, notes: [...notes] }];
  }

  const groups: StreamGroup[] = [];
  for (const note of notes) {
    const date = resolveNoteDate(note, query.dateField);
    const key = groupKey(date, query.group);
    const last = groups[groups.length - 1];
    // Only merge with the group directly above, so the headers always describe
    // the order actually on screen.
    if (last !== undefined && last.key === key) {
      last.notes.push(note);
      continue;
    }
    groups.push({ key, header: formatGroupHeader(date, query.group, locale), notes: [note] });
  }
  return groups;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/group.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/group.ts tests/engine/group.test.ts
git commit -m "feat: group stream notes into date headers"
```

---

### Task 14: The stream pipeline

**Files:**
- Create: `src/engine/run.ts`
- Create: `tests/engine/run.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/run.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runStream } from "../../src/engine/run";
import { parseQuery } from "../../src/query/parse";
import { localDate, note } from "../fixtures/notes";

const NOW = new Date(2026, 8, 4);

const NOTES = [
  note({ path: "Journal/03.md", tags: ["daily"], ctime: localDate(2026, 9, 3) }),
  note({ path: "Journal/04a.md", tags: ["daily"], ctime: localDate(2026, 9, 4) }),
  note({ path: "Journal/04b.md", tags: ["daily"], ctime: localDate(2026, 9, 4) }),
  note({ path: "Books/dune.md", tags: ["book"], ctime: localDate(2026, 1, 1) }),
];

describe("runStream", () => {
  it("filters, sorts and groups in that order", () => {
    const result = runStream(NOTES, parseQuery("folder: Journal\ngroup: day"), NOW, "en-GB");
    expect(result.groups.map((g) => g.header)).toEqual(["4 September 2026", "3 September 2026"]);
    expect(result.groups[0].notes.map((n) => n.path)).toEqual(["Journal/04a.md", "Journal/04b.md"]);
    expect(result.matched).toBe(3);
    expect(result.shown).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it("applies the limit after sorting and reports truncation", () => {
    const result = runStream(NOTES, parseQuery("limit: 2"), NOW, "en-GB");
    expect(result.shown).toBe(2);
    expect(result.matched).toBe(4);
    expect(result.truncated).toBe(true);
    expect(result.groups[0].notes.map((n) => n.path)).toEqual(["Journal/04a.md", "Journal/04b.md"]);
  });

  it("groups only the notes that survived the limit", () => {
    const result = runStream(NOTES, parseQuery("group: day\nlimit: 2"), NOW, "en-GB");
    expect(result.groups.map((g) => g.header)).toEqual(["4 September 2026"]);
  });

  it("keeps days contiguous when the declared sort is on something else", () => {
    // Without the date leading the sort, this gave one header per note.
    const journal = [
      note({ path: "Journal/c.md", basename: "c", ctime: localDate(2026, 9, 1) }),
      note({ path: "Journal/a.md", basename: "a", ctime: localDate(2026, 9, 2) }),
      note({ path: "Journal/b.md", basename: "b", ctime: localDate(2026, 9, 1) }),
      note({ path: "Journal/d.md", basename: "d", ctime: localDate(2026, 9, 2) }),
    ];
    const result = runStream(journal, parseQuery("group: day\nsort: file.name asc"), NOW, "en-GB");
    expect(result.groups.map((g) => g.header)).toEqual(["2 September 2026", "1 September 2026"]);
    expect(result.groups.map((g) => g.notes.map((note) => note.basename))).toEqual([
      ["a", "d"],
      ["b", "c"],
    ]);
  });

  it("reports an empty result without groups", () => {
    const result = runStream(NOTES, parseQuery("tags: nonexistent"), NOW, "en-GB");
    expect(result.groups).toEqual([]);
    expect(result.matched).toBe(0);
    expect(result.shown).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("reports a date fallback when a declared date-field reaches no note", () => {
    // The signature of `date-field: dat` — every note falls back to ctime.
    const result = runStream(NOTES, parseQuery("date-field: dat"), NOW, "en-GB");
    expect(result.dateFallback).toBe(true);
  });

  it("still reports a date fallback when the range emptied the result", () => {
    // The typo puts every note on the ctime fallback, the June range then
    // excludes them all, and judging after the range would go quiet.
    const january = [
      note({ path: "a.md", ctime: localDate(2026, 1, 5) }),
      note({ path: "b.md", ctime: localDate(2026, 1, 9) }),
    ];
    const query = parseQuery("date-field: dat\nfrom: 2026-06-01\nto: 2026-06-30");
    const result = runStream(january, query, NOW, "en-GB");
    expect(result.shown).toBe(0);
    expect(result.dateFallback).toBe(true);
  });

  it("reports a sort field that resolved for no note", () => {
    // `file.ctim` is a typo for `file.ctime`; every note ties and the order
    // silently falls through to the path tie-break.
    const result = runStream(NOTES, parseQuery("sort: file.ctim desc"), NOW, "en-GB");
    expect(result.unresolvedSort).toEqual(["file.ctim"]);
  });

  it("reports no unresolved sort when the field resolves for some note", () => {
    const mixed = [
      note({ path: "a.md", frontmatter: { rating: 5 } }),
      note({ path: "b.md" }),
    ];
    expect(runStream(mixed, parseQuery("sort: rating desc"), NOW, "en-GB").unresolvedSort).toEqual(
      [],
    );
    expect(runStream(NOTES, parseQuery(""), NOW, "en-GB").unresolvedSort).toEqual([]);
    expect(
      runStream(NOTES, parseQuery("tags: nonexistent\nsort: file.ctim"), NOW, "en-GB")
        .unresolvedSort,
    ).toEqual([]);
  });

  it("reports no date fallback when the field resolves, or when it is the default", () => {
    const dated = [note({ path: "a.md", frontmatter: { date: "2026-09-04" } })];
    expect(runStream(dated, parseQuery("date-field: date"), NOW, "en-GB").dateFallback).toBe(false);
    // Only a *declared* field can be a typo; the default is nobody's mistake.
    expect(runStream(NOTES, parseQuery(""), NOW, "en-GB").dateFallback).toBe(false);
    // Nor is an empty stream evidence of one.
    expect(
      runStream(NOTES, parseQuery("tags: nonexistent\ndate-field: dat"), NOW, "en-GB").dateFallback,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/run.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/run`.

- [ ] **Step 3: Write the implementation**

`src/engine/run.ts`:

```ts
import { coerceDate } from "./dates";
import { resolveField } from "./fields";
import { filterNotes } from "./filter";
import { groupNotes, type StreamGroup } from "./group";
import { sortNotes } from "./sort";
import type { NoteMeta } from "./note";
import type { SortSpec, StreamQuery } from "../query/types";

/**
 * Grouping only reads chronologically, so when it is on the resolved date leads
 * the sort and the declared keys order notes inside each group. Without this,
 * `group: day` with `sort: title asc` scatters the days and emits one header per
 * note — five notes across three days gave five headers, two dates repeating
 * non-adjacently. The direction follows the declared sort when its first key is
 * the date field, and is newest-first otherwise.
 */
function effectiveSort(query: StreamQuery): SortSpec[] {
  if (query.group === "none") {
    return query.sort;
  }
  const [first] = query.sort;
  const direction =
    first !== undefined && first.field === query.dateField ? first.direction : "desc";
  const within = query.sort.filter((spec) => spec.field !== query.dateField);
  return [{ field: query.dateField, direction }, ...within];
}

export interface StreamResult {
  groups: StreamGroup[];
  /** How many notes matched, before the limit. */
  matched: number;
  /** How many notes the groups actually hold. */
  shown: number;
  truncated: boolean;
  /**
   * True when a declared `date-field` yielded a usable date for no note on
   * screen — the signature of a typo in the field name, which would otherwise
   * order the whole stream by file creation time with nothing to say so.
   */
  dateFallback: boolean;
  /**
   * Sort fields that resolved for no note on screen. A missing value sorts
   * last, so a key nothing resolves leaves every note tied and the order falls
   * through to the `file.path` tie-break: `sort: file.ctim desc` quietly
   * becomes alphabetical by path, which looks like a working stream.
   */
  unresolvedSort: string[];
}

export function runStream(
  notes: NoteMeta[],
  query: StreamQuery,
  now: Date,
  locale?: string,
): StreamResult {
  const matched = filterNotes(notes, query, now);
  const shown = sortNotes(matched, effectiveSort(query), locale).slice(0, query.limit);

  // The date-field check is judged against the notes the query reached *before*
  // its range narrowed them. A typo'd date-field puts every note on the ctime
  // fallback, the range then filters on creation time and can exclude them all,
  // and an empty result would suppress the very notice that explains the typo.
  const reached =
    query.from === null && query.to === null
      ? matched
      : filterNotes(notes, { ...query, from: null, to: null }, now);

  return {
    groups: groupNotes(shown, query, locale),
    matched: matched.length,
    shown: shown.length,
    truncated: matched.length > shown.length,
    dateFallback:
      query.dateField !== "file.ctime" &&
      reached.length > 0 &&
      reached.every((note) => coerceDate(resolveField(note, query.dateField)) === null),
    unresolvedSort:
      shown.length === 0
        ? []
        : query.sort
            .filter((spec) =>
              shown.every((note) => resolveField(note, spec.field) === undefined),
            )
            .map((spec) => spec.field),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/run.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/run.ts tests/engine/run.test.ts
git commit -m "feat: assemble the stream pipeline"
```

---

### Task 15: Preview extraction

**Files:**
- Create: `src/engine/preview.ts`
- Create: `tests/engine/preview.test.ts`

Previews are plain text on purpose. Truncating markdown produces half-open code fences and dangling list items, so the excerpt drops markup instead of rendering it.

- [ ] **Step 1: Write the failing test**

`tests/engine/preview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractPreview, stripFrontmatter } from "../../src/engine/preview";

describe("stripFrontmatter", () => {
  it("removes a leading frontmatter block", () => {
    expect(stripFrontmatter("---\ndate: 2026-09-04\n---\nBody text")).toBe("Body text");
  });

  it("handles CRLF line endings", () => {
    expect(stripFrontmatter("---\r\ndate: x\r\n---\r\nBody")).toBe("Body");
  });

  it("leaves a note without frontmatter alone", () => {
    expect(stripFrontmatter("# Title\n\nBody")).toBe("# Title\n\nBody");
  });

  it("does not remove a horizontal rule further down", () => {
    expect(stripFrontmatter("Body\n\n---\n\nMore")).toBe("Body\n\n---\n\nMore");
  });
});

describe("extractPreview", () => {
  it("drops frontmatter and collapses whitespace", () => {
    const content = "---\ndate: 2026-09-04\n---\n\nFirst line.\n\nSecond   line.";
    expect(extractPreview(content, "2026-09-04", 200)).toBe("First line. Second line.");
  });

  it("drops a leading heading that repeats the file name", () => {
    expect(extractPreview("# Dune\n\nA desert planet.", "Dune", 200)).toBe("A desert planet.");
  });

  it("keeps a leading heading that says something else, without its markers", () => {
    expect(extractPreview("# Summary\n\nA desert planet.", "Dune", 200)).toBe(
      "Summary A desert planet.",
    );
  });

  it("returns short content untouched", () => {
    expect(extractPreview("Short.", "note", 200)).toBe("Short.");
  });

  it("cuts on a word boundary and adds an ellipsis", () => {
    const preview = extractPreview("alpha bravo charlie delta echo", "note", 20);
    expect(preview).toBe("alpha bravo charlie…");
  });

  it("cuts mid-word when there is no usable space", () => {
    const preview = extractPreview("abcdefghijklmnopqrstuvwxyz", "note", 10);
    expect(preview).toBe("abcdefghij…");
  });

  it("trims trailing punctuation before the ellipsis", () => {
    expect(extractPreview("alpha bravo, charlie", "note", 12)).toBe("alpha bravo…");
  });

  it("returns an empty string for an empty note", () => {
    expect(extractPreview("---\ndate: x\n---\n", "note", 200)).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/preview.test.ts`
Expected: FAIL — cannot resolve `../../src/engine/preview`.

- [ ] **Step 3: Write the implementation**

`src/engine/preview.ts`:

```ts
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const LEADING_HEADING = /^#{1,6}[ \t]+(.+?)[ \t]*(?:\r?\n|$)/;
const HEADING_MARKERS = /^#{1,6}[ \t]+/gm;

export function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER, "");
}

/**
 * A plain-text excerpt of a note's body, at most `length` characters plus an
 * ellipsis. Markdown markers are dropped rather than rendered — a truncated
 * markdown string cannot be rendered safely.
 */
export function extractPreview(content: string, basename: string, length: number): string {
  let body = stripFrontmatter(content).replace(/^\s+/, "");

  // A note whose first heading repeats its file name adds nothing to a stream
  // that already shows the title.
  const heading = LEADING_HEADING.exec(body);
  if (heading !== null && heading[1].trim().toLowerCase() === basename.trim().toLowerCase()) {
    body = body.slice(heading[0].length).replace(/^\s+/, "");
  }

  const text = body.replace(HEADING_MARKERS, "").replace(/\s+/g, " ").trim();
  if (text.length <= length) {
    return text;
  }

  const cut = text.slice(0, length);
  const lastSpace = cut.lastIndexOf(" ");
  const onBoundary = lastSpace > length * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${onBoundary.replace(/[\s,.;:!?-]+$/, "")}…`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/engine/preview.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/preview.ts tests/engine/preview.test.ts
git commit -m "feat: extract plain-text note previews"
```

---

### Task 16: Describing a query

**Files:**
- Create: `src/query/describe.ts`
- Create: `tests/query/describe.test.ts`

An empty stream shows this line beneath "No notes match this stream." so the reader can see what was actually asked rather than guessing.

- [ ] **Step 1: Write the failing test**

`tests/query/describe.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { describeQuery } from "../../src/query/describe";
import { parseQuery } from "../../src/query/parse";

function summaryOf(source: string) {
  return describeQuery(parseQuery(source));
}

describe("describeQuery", () => {
  it("describes the default query", () => {
    expect(summaryOf("")).toBe("whole vault · sorted by file.ctime desc · limit 50");
  });

  it("names folders and tags", () => {
    expect(summaryOf("folder: [Journal, Books]\ntags: [book, read]")).toContain(
      "folders journal, books",
    );
    expect(summaryOf("tags: [book, read]")).toContain("all tags book, read");
    expect(summaryOf("tags-any: [film, tv]")).toContain("any tag film, tv");
  });

  it("names exclusions", () => {
    const summary = summaryOf("exclude-folder: Archive\nexclude-tags: draft");
    expect(summary).toContain("not in archive");
    expect(summary).toContain("not tagged draft");
  });

  it("describes a title match", () => {
    expect(summaryOf("title: weekly")).toContain('title contains "weekly"');
    expect(summaryOf("title: /^20/")).toContain("title matches /^20/");
  });

  it("describes where conditions", () => {
    expect(summaryOf("where:\n  status: done")).toContain("status = done");
    expect(summaryOf("where:\n  type: [a, b]")).toContain("type is one of a, b");
    expect(summaryOf('where:\n  rating: ">3"')).toContain("rating > 3");
    expect(summaryOf("where:\n  due: exists")).toContain("due exists");
    expect(summaryOf("where:\n  due: missing")).toContain("due missing");
  });

  it("describes a date range", () => {
    expect(summaryOf("date-field: date\nfrom: 2026-01-01\nto: today")).toContain(
      "date from 2026-01-01 to today",
    );
    expect(summaryOf("from: -30d")).toContain("file.ctime from -30d onwards");
    expect(summaryOf("to: 2026-01-01")).toContain("file.ctime up to 2026-01-01");
  });

  it("describes grouping when it is on", () => {
    expect(summaryOf("group: month")).toContain("grouped by month");
    expect(summaryOf("")).not.toContain("grouped by");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/query/describe.test.ts`
Expected: FAIL — cannot resolve `../../src/query/describe`.

- [ ] **Step 3: Write the implementation**

`src/query/describe.ts`:

```ts
import type { DateExpr } from "../engine/dates";
import type { StreamQuery, WhereCondition } from "./types";

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

  parts.push(
    `sorted by ${query.sort.map((spec) => `${spec.field} ${spec.direction}`).join(", ")}`,
  );
  if (query.group !== "none") {
    parts.push(`grouped by ${query.group}`);
  }
  parts.push(`limit ${query.limit}`);

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/query/describe.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/query/describe.ts tests/query/describe.test.ts
git commit -m "feat: summarize a query for the empty state"
```

---
### Task 17: The Obsidian adapter

**Files:**
- Create: `src/obsidian/adapter.ts`
- Create: `tests/mocks/obsidian.ts`
- Create: `tests/obsidian/adapter.test.ts`
- Modify: `vitest.config.ts` (add the `obsidian` alias)

This is the only file that turns Obsidian objects into engine data. It stays this small on purpose. Types still come from the real `obsidian` package at compile time; only the runtime module is aliased for tests.

- [ ] **Step 1: Write the `obsidian` runtime mock**

`tests/mocks/obsidian.ts`. It implements just enough of `getAllTags` to exercise the adapter: frontmatter tags plus inline tags, each with a leading `#`, or null when there are none.

```ts
export interface MockCachedMetadata {
  frontmatter?: Record<string, unknown>;
  tags?: Array<{ tag: string }>;
}

export function getAllTags(cache: MockCachedMetadata): string[] | null {
  const tags: string[] = [];

  const fromFrontmatter = cache.frontmatter?.tags;
  if (typeof fromFrontmatter === "string") {
    tags.push(...fromFrontmatter.split(/[,\s]+/).filter((tag) => tag.length > 0));
  } else if (Array.isArray(fromFrontmatter)) {
    tags.push(...fromFrontmatter.map(String));
  }

  for (const inline of cache.tags ?? []) {
    tags.push(inline.tag);
  }

  if (tags.length === 0) {
    return null;
  }
  return tags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
}

/** Placeholders so a test that touches the view layer does not crash on import. */
export class Component {}
export class MarkdownRenderChild extends Component {}
export class Plugin extends Component {}
```

- [ ] **Step 2: Point vitest at the mock**

Replace `vitest.config.ts` with:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      // Runtime only. TypeScript still checks against the real obsidian types.
      obsidian: fileURLToPath(new URL("./tests/mocks/obsidian.ts", import.meta.url)),
    },
  },
});
```

- [ ] **Step 3: Write the failing test**

`tests/obsidian/adapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { App, CachedMetadata, TFile } from "obsidian";
import { collectNotes, toNoteMeta } from "../../src/obsidian/adapter";

function file(path: string, ctime = 1_000, mtime = 2_000): TFile {
  return {
    path,
    basename: path.split("/").pop()!.replace(/\.md$/, ""),
    stat: { ctime, mtime, size: 0 },
  } as unknown as TFile;
}

function fakeApp(entries: Array<[TFile, CachedMetadata | null]>): App {
  return {
    vault: { getMarkdownFiles: () => entries.map(([f]) => f) },
    metadataCache: {
      getFileCache: (target: TFile) =>
        entries.find(([f]) => f.path === target.path)?.[1] ?? null,
    },
  } as unknown as App;
}

describe("toNoteMeta", () => {
  it("copies path, basename and timestamps", () => {
    const meta = toNoteMeta(file("Journal/2026-09-04.md", 111, 222), null);
    expect(meta.path).toBe("Journal/2026-09-04.md");
    expect(meta.basename).toBe("2026-09-04");
    expect(meta.ctime).toBe(111);
    expect(meta.mtime).toBe(222);
  });

  it("normalizes tags from frontmatter and inline tags together", () => {
    const cache = {
      frontmatter: { tags: ["Book"] },
      tags: [{ tag: "#Reading" }],
    } as unknown as CachedMetadata;
    expect(toNoteMeta(file("a.md"), cache).tags).toEqual(["book", "reading"]);
  });

  it("yields empty collections for a note with no cache", () => {
    const meta = toNoteMeta(file("a.md"), null);
    expect(meta.tags).toEqual([]);
    expect(meta.frontmatter).toEqual({});
  });

  it("keeps frontmatter as plain data", () => {
    const cache = { frontmatter: { rating: 5, status: "done" } } as unknown as CachedMetadata;
    expect(toNoteMeta(file("a.md"), cache).frontmatter).toEqual({ rating: 5, status: "done" });
  });
});

describe("collectNotes", () => {
  it("maps every markdown file in the vault", () => {
    const app = fakeApp([
      [file("a.md"), { frontmatter: { rating: 1 } } as unknown as CachedMetadata],
      [file("b.md"), null],
    ]);
    const notes = collectNotes(app);
    expect(notes.map((n) => n.path)).toEqual(["a.md", "b.md"]);
    expect(notes[0].frontmatter).toEqual({ rating: 1 });
  });

  it("returns an empty list for an empty vault", () => {
    expect(collectNotes(fakeApp([]))).toEqual([]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/obsidian/adapter.test.ts`
Expected: FAIL — cannot resolve `../../src/obsidian/adapter`.

- [ ] **Step 5: Write the implementation**

`src/obsidian/adapter.ts`:

```ts
import { getAllTags, type App, type CachedMetadata, type TFile } from "obsidian";
import { normalizeTag, type NoteMeta } from "../engine/note";

export function toNoteMeta(file: TFile, cache: CachedMetadata | null): NoteMeta {
  const tags = cache === null ? [] : (getAllTags(cache) ?? []);
  return {
    path: file.path,
    basename: file.basename,
    tags: tags.map(normalizeTag),
    frontmatter: (cache?.frontmatter ?? {}) as Record<string, unknown>,
    ctime: file.stat.ctime,
    mtime: file.stat.mtime,
  };
}

/** Every markdown note in the vault, as plain data. Both sources are already in memory. */
export function collectNotes(app: App): NoteMeta[] {
  return app.vault
    .getMarkdownFiles()
    .map((file) => toNoteMeta(file, app.metadataCache.getFileCache(file)));
}
```

- [ ] **Step 6: Run the whole suite**

Run: `npm test`
Expected: PASS — every file, including the previous tasks, still green after the alias change.

- [ ] **Step 7: Commit**

```bash
git add src/obsidian/adapter.ts tests/mocks/obsidian.ts tests/obsidian/adapter.test.ts vitest.config.ts
git commit -m "feat: translate vault files into engine data"
```

---

### Task 18: The error box and stylesheet

**Files:**
- Create: `src/view/errorEl.ts`
- Create: `styles.css`

No unit tests here: this is DOM built on Obsidian's `createDiv` helpers, verified manually in Task 23. Keep the logic in it at zero.

- [ ] **Step 1: Write `src/view/errorEl.ts`**

```ts
import { QueryError } from "../query/types";

/** Replace the block's contents with a visible error. Never log-only. */
export function renderError(container: HTMLElement, error: unknown): void {
  container.empty();
  const box = container.createDiv({ cls: "ss-error" });
  box.createDiv({ cls: "ss-error-title", text: "Simple Streams" });
  box.createDiv({ cls: "ss-error-message", text: messageOf(error) });
}

function messageOf(error: unknown): string {
  if (error instanceof QueryError) {
    return error.line === undefined ? error.message : `Line ${error.line}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
```

- [ ] **Step 2: Write `styles.css`**

Every colour comes from an Obsidian theme variable, so the stream follows the user's theme in both light and dark.

```css
.simple-streams {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-3);
}

.ss-list {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-3);
}

.ss-group {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: var(--size-2-2) 0;
  background: var(--background-primary);
  border-bottom: 1px solid var(--background-modifier-border);
  color: var(--text-muted);
  font-size: var(--font-ui-small);
  font-weight: var(--font-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ss-item {
  padding: var(--size-4-2) 0;
  border-bottom: 1px solid var(--background-modifier-border);
}

.ss-item:last-child {
  border-bottom: none;
}

.ss-item-header {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--size-4-2);
}

.ss-item-title {
  font-weight: var(--font-semibold);
  color: var(--link-color);
  text-decoration: none;
  cursor: pointer;
}

.ss-item-title:hover {
  text-decoration: underline;
}

.ss-item-date {
  color: var(--text-faint);
  font-size: var(--font-ui-smaller);
}

.ss-item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--size-2-2);
}

.ss-item-tag {
  padding: 0 var(--size-2-2);
  border-radius: var(--radius-s);
  background: var(--background-modifier-hover);
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
}

.ss-item-body {
  margin-top: var(--size-2-3);
  color: var(--text-normal);
}

.ss-item-warning,
.ss-empty,
.ss-empty-summary {
  color: var(--text-muted);
  font-size: var(--font-ui-small);
}

.ss-notice {
  padding: var(--size-2-2) var(--size-4-2);
  border-left: 2px solid var(--text-accent);
  border-radius: var(--radius-s);
  background: var(--background-modifier-hover);
  color: var(--text-muted);
  font-size: var(--font-ui-small);
}

.ss-empty-summary {
  color: var(--text-faint);
  font-family: var(--font-monospace);
  font-size: var(--font-ui-smaller);
  overflow-wrap: anywhere;
}

.ss-sentinel {
  height: 1px;
}

.ss-error {
  padding: var(--size-4-2);
  border: 1px solid var(--text-error);
  border-radius: var(--radius-s);
  background: var(--background-modifier-error);
}

.ss-error-title {
  color: var(--text-error);
  font-size: var(--font-ui-smaller);
  font-weight: var(--font-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ss-error-message {
  margin-top: var(--size-2-2);
  color: var(--text-normal);
  font-family: var(--font-monospace);
  font-size: var(--font-ui-small);
  overflow-wrap: anywhere;
}
```

- [ ] **Step 3: Verify the build still type-checks**

Run: `npm run build`
Expected: no TypeScript errors, `main.js` written.

- [ ] **Step 4: Commit**

```bash
git add src/view/errorEl.ts styles.css
git commit -m "feat: add the stream error box and stylesheet"
```

---

### Task 19: Rendering one item

**Files:**
- Create: `src/view/itemEl.ts`

Manual verification only, in Task 23. Note the `MarkdownRenderChild` parenting in `display: full` — without it, embeds and other plugins' render children inside items leak when the block is destroyed.

- [ ] **Step 1: Write `src/view/itemEl.ts`**

```ts
import { MarkdownRenderChild, MarkdownRenderer, type App, type Component } from "obsidian";
import { resolveNoteDate } from "../engine/fields";
import { extractPreview, stripFrontmatter } from "../engine/preview";
import type { NoteMeta } from "../engine/note";
import type { StreamQuery } from "../query/types";

export interface ItemContext {
  app: App;
  query: StreamQuery;
  /** The stream's own render child, so per-item children unload with the block. */
  parent: Component;
  /** Path of the note holding the stream block, for link resolution. */
  sourcePath: string;
}

export async function renderItem(
  container: HTMLElement,
  note: NoteMeta,
  ctx: ItemContext,
): Promise<void> {
  const item = container.createDiv({ cls: "ss-item" });
  renderHeader(item, note, ctx);

  if (ctx.query.display === "title") {
    return;
  }

  const file = ctx.app.vault.getFileByPath(note.path);
  if (file === null) {
    item.createDiv({ cls: "ss-item-warning", text: `Could not open ${note.path}` });
    return;
  }

  let content: string;
  try {
    content = await ctx.app.vault.cachedRead(file);
  } catch (error) {
    // One unreadable note must not take the rest of the stream with it.
    item.createDiv({
      cls: "ss-item-warning",
      text: `Could not read ${note.path}: ${error instanceof Error ? error.message : String(error)}`,
    });
    return;
  }

  const body = item.createDiv({ cls: "ss-item-body" });
  if (ctx.query.display === "preview") {
    body.setText(extractPreview(content, note.basename, ctx.query.previewLength));
    return;
  }

  const child = new MarkdownRenderChild(body);
  ctx.parent.addChild(child);
  await MarkdownRenderer.render(ctx.app, stripFrontmatter(content), body, note.path, child);
}

function renderHeader(item: HTMLElement, note: NoteMeta, ctx: ItemContext): void {
  const header = item.createDiv({ cls: "ss-item-header" });

  const link = header.createEl("a", {
    cls: "ss-item-title",
    text: note.basename,
    href: note.path,
  });
  link.addEventListener("click", (event) => {
    event.preventDefault();
    ctx.app.workspace.openLinkText(
      note.path,
      ctx.sourcePath,
      event.metaKey || event.ctrlKey,
    );
  });

  header.createSpan({
    cls: "ss-item-date",
    text: formatItemDate(resolveNoteDate(note, ctx.query.dateField)),
  });

  if (note.tags.length > 0) {
    const tags = header.createDiv({ cls: "ss-item-tags" });
    for (const tag of note.tags) {
      tags.createSpan({ cls: "ss-item-tag", text: `#${tag}` });
    }
  }
}

function formatItemDate(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/view/itemEl.ts
git commit -m "feat: render one stream item"
```

---

### Task 20: The stream render child

**Files:**
- Create: `src/view/StreamChild.ts`

This owns the DOM for one block: parse once in the constructor, render on load, add a page when the sentinel approaches, re-render on refresh only when the result actually changed.

- [ ] **Step 1: Write `src/view/StreamChild.ts`**

```ts
import { MarkdownRenderChild, type App } from "obsidian";
import { runStream, type StreamResult } from "../engine/run";
import { collectNotes } from "../obsidian/adapter";
import { describeQuery } from "../query/describe";
import { parseQuery } from "../query/parse";
import { renderError } from "./errorEl";
import { renderItem } from "./itemEl";
import type { NoteMeta } from "../engine/note";
import type { StreamQuery } from "../query/types";

const PAGE_SIZE = 20;

interface Row {
  /** The group header to print above this row, or null. */
  header: string | null;
  note: NoteMeta;
}

export class StreamChild extends MarkdownRenderChild {
  private readonly app: App;
  private readonly sourcePath: string;
  private query: StreamQuery | null = null;
  private failure: unknown = null;

  private rows: Row[] = [];
  private rendered = 0;
  private pages = 1;
  private signature = "";

  private listEl: HTMLElement | null = null;
  private sentinelEl: HTMLElement | null = null;
  private observer: IntersectionObserver | null = null;

  constructor(containerEl: HTMLElement, app: App, source: string, sourcePath: string) {
    super(containerEl);
    this.app = app;
    this.sourcePath = sourcePath;
    try {
      this.query = parseQuery(source);
    } catch (error) {
      this.failure = error;
    }
  }

  onload(): void {
    void this.render();
  }

  onunload(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  showError(error: unknown): void {
    renderError(this.containerEl, error);
  }

  /** Re-render only when the matching notes or their mtimes changed. */
  async refresh(): Promise<void> {
    if (this.query === null) {
      return;
    }
    let next: string;
    try {
      next = signatureOf(this.compute());
    } catch (error) {
      this.showError(error);
      return;
    }
    if (next === this.signature) {
      return;
    }

    const scroller = this.scrollerEl();
    const scrollTop = scroller?.scrollTop ?? 0;
    await this.render();
    if (scroller !== null) {
      scroller.scrollTop = scrollTop;
    }
  }

  private compute(): StreamResult {
    if (this.query === null) {
      throw new Error("Simple Streams: no query to run");
    }
    return runStream(collectNotes(this.app), this.query, new Date());
  }

  private async render(): Promise<void> {
    this.observer?.disconnect();
    this.observer = null;
    this.containerEl.empty();

    if (this.query === null) {
      this.showError(this.failure);
      return;
    }

    let result: StreamResult;
    try {
      result = this.compute();
    } catch (error) {
      this.showError(error);
      return;
    }

    this.signature = signatureOf(result);
    this.rows = toRows(result);
    this.rendered = 0;

    const root = this.containerEl.createDiv({ cls: "simple-streams" });
    if (this.rows.length === 0) {
      root.createDiv({ cls: "ss-empty", text: "No notes match this stream." });
      root.createDiv({ cls: "ss-empty-summary", text: describeQuery(this.query) });
      this.listEl = null;
      this.sentinelEl = null;
      return;
    }

    renderNotices(root, this.query, result);
    this.listEl = root.createDiv({ cls: "ss-list" });
    this.sentinelEl = root.createDiv({ cls: "ss-sentinel" });
    await this.renderUpTo(this.pages);
    this.watchSentinel();
  }

  private async renderUpTo(pages: number): Promise<void> {
    const list = this.listEl;
    const query = this.query;
    if (list === null || query === null) {
      return;
    }

    const target = Math.min(pages * PAGE_SIZE, this.rows.length);
    while (this.rendered < target) {
      const row = this.rows[this.rendered];
      if (row.header !== null) {
        list.createDiv({ cls: "ss-group", text: row.header });
      }
      await renderItem(list, row.note, {
        app: this.app,
        query,
        parent: this,
        sourcePath: this.sourcePath,
      });
      this.rendered += 1;
    }

    if (this.rendered >= this.rows.length) {
      this.observer?.disconnect();
      this.observer = null;
      this.sentinelEl?.remove();
      this.sentinelEl = null;
    }
  }

  private watchSentinel(): void {
    const sentinel = this.sentinelEl;
    if (sentinel === null) {
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        this.pages += 1;
        void this.renderUpTo(this.pages);
      },
      { rootMargin: "200px" },
    );
    this.observer.observe(sentinel);
  }

  private scrollerEl(): HTMLElement | null {
    return this.containerEl.closest<HTMLElement>(".markdown-preview-view, .cm-scroller");
  }
}

/**
 * Say once, for the whole block, when a field the query declared reached no
 * note. Both cases otherwise look like a working stream in the wrong order.
 */
function renderNotices(root: HTMLElement, query: StreamQuery, result: StreamResult): void {
  if (result.dateFallback) {
    root.createDiv({
      cls: "ss-notice",
      text: `No note here has a usable \`${query.dateField}\`, so this stream is ordered and grouped by file creation time.`,
    });
  }
  if (result.unresolvedSort.length > 0) {
    const fields = result.unresolvedSort.map((field) => `\`${field}\``).join(" or ");
    root.createDiv({
      cls: "ss-notice",
      text: `No note here has ${fields}, so that part of the sort had no effect.`,
    });
  }
}

function toRows(result: StreamResult): Row[] {
  const rows: Row[] = [];
  for (const group of result.groups) {
    group.notes.forEach((note, index) => {
      rows.push({ header: index === 0 ? group.header : null, note });
    });
  }
  return rows;
}

function signatureOf(result: StreamResult): string {
  return result.groups
    .flatMap((group) => group.notes.map((note) => `${note.path}:${note.mtime}`))
    .join("|");
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/view/StreamChild.ts
git commit -m "feat: render a stream block with lazy paging"
```

---

### Task 21: The refresh registry

**Files:**
- Create: `src/obsidian/registry.ts`
- Create: `tests/obsidian/registry.test.ts`

The registry depends on a narrow `RefreshableStream` interface rather than on `StreamChild`, which is what makes the debounce testable without a DOM.

- [ ] **Step 1: Write the failing test**

`tests/obsidian/registry.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App, EventRef } from "obsidian";
import { DEBOUNCE_MS, StreamRegistry, type RefreshableStream } from "../../src/obsidian/registry";

type Handler = () => void;

function fakeApp() {
  const handlers: Record<string, Handler[]> = {};
  const on = (event: string, handler: Handler) => {
    handlers[event] = [...(handlers[event] ?? []), handler];
    return { event } as unknown as EventRef;
  };
  const app = {
    vault: { on },
    metadataCache: { on },
  } as unknown as App;
  return {
    app,
    fire(event: string) {
      for (const handler of handlers[event] ?? []) {
        handler();
      }
    },
    events: () => Object.keys(handlers),
  };
}

function stubStream() {
  return {
    refreshes: 0,
    errors: [] as unknown[],
    async refresh() {
      this.refreshes += 1;
    },
    showError(error: unknown) {
      this.errors.push(error);
    },
  };
}

let harness: ReturnType<typeof fakeApp>;
let registry: StreamRegistry;

beforeEach(() => {
  vi.useFakeTimers();
  harness = fakeApp();
  registry = new StreamRegistry(harness.app);
  registry.start();
});

afterEach(() => {
  registry.stop();
  vi.useRealTimers();
});

describe("StreamRegistry", () => {
  it("subscribes to the four events that can change a stream", () => {
    expect(harness.events().sort()).toEqual(["changed", "create", "delete", "rename"]);
  });

  it("refreshes a registered stream after the debounce", async () => {
    const stream = stubStream();
    registry.register(stream);

    harness.fire("changed");
    expect(stream.refreshes).toBe(0);

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(stream.refreshes).toBe(1);
  });

  it("coalesces a burst of events into one refresh", async () => {
    const stream = stubStream();
    registry.register(stream);

    harness.fire("changed");
    harness.fire("create");
    harness.fire("delete");
    harness.fire("rename");

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(stream.refreshes).toBe(1);
  });

  it("refreshes every registered stream", async () => {
    const a = stubStream();
    const b = stubStream();
    registry.register(a);
    registry.register(b);

    harness.fire("changed");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(a.refreshes).toBe(1);
    expect(b.refreshes).toBe(1);
  });

  it("stops refreshing an unregistered stream", async () => {
    const stream = stubStream();
    registry.register(stream);
    registry.unregister(stream);

    harness.fire("changed");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(stream.refreshes).toBe(0);
  });

  it("shows a failing stream its error and still refreshes the others", async () => {
    const boom = new Error("boom");
    const broken: RefreshableStream & { errors: unknown[] } = {
      errors: [],
      refresh: () => Promise.reject(boom),
      showError(error: unknown) {
        this.errors.push(error);
      },
    };
    const healthy = stubStream();
    registry.register(broken);
    registry.register(healthy);

    harness.fire("changed");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(broken.errors).toEqual([boom]);
    expect(healthy.refreshes).toBe(1);
  });

  it("drops a pending refresh when stopped", async () => {
    const stream = stubStream();
    registry.register(stream);

    harness.fire("changed");
    registry.stop();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(stream.refreshes).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/obsidian/registry.test.ts`
Expected: FAIL — cannot resolve `../../src/obsidian/registry`.

- [ ] **Step 3: Write the implementation**

`src/obsidian/registry.ts`:

```ts
import type { App, EventRef } from "obsidian";

export const DEBOUNCE_MS = 300;

/** What the registry needs from a stream. Keeps this file free of DOM concerns. */
export interface RefreshableStream {
  refresh(): Promise<void>;
  showError(error: unknown): void;
}

export class StreamRegistry {
  private readonly app: App;
  private readonly streams = new Set<RefreshableStream>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Subscribe to the events that can change a stream. The returned refs should
   * be handed to Plugin.registerEvent so they unsubscribe with the plugin.
   */
  start(): EventRef[] {
    return [
      this.app.metadataCache.on("changed", () => this.schedule()),
      this.app.vault.on("create", () => this.schedule()),
      this.app.vault.on("delete", () => this.schedule()),
      this.app.vault.on("rename", () => this.schedule()),
    ];
  }

  register(stream: RefreshableStream): void {
    this.streams.add(stream);
  }

  unregister(stream: RefreshableStream): void {
    this.streams.delete(stream);
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.streams.clear();
  }

  private schedule(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, DEBOUNCE_MS);
  }

  private async flush(): Promise<void> {
    for (const stream of [...this.streams]) {
      try {
        await stream.refresh();
      } catch (error) {
        // A stream that cannot refresh says so in its own block, and the rest
        // of the streams still get their turn.
        stream.showError(error);
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/obsidian/registry.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/registry.ts tests/obsidian/registry.test.ts
git commit -m "feat: refresh mounted streams on vault changes"
```

---

### Task 22: Plugin wiring

**Files:**
- Modify: `src/main.ts` (replace the Task 1 stub entirely)

- [ ] **Step 1: Replace `src/main.ts`**

```ts
import { Plugin } from "obsidian";
import { StreamRegistry } from "./obsidian/registry";
import { StreamChild } from "./view/StreamChild";

export default class SimpleStreamsPlugin extends Plugin {
  private registry: StreamRegistry | null = null;

  async onload(): Promise<void> {
    const registry = new StreamRegistry(this.app);
    this.registry = registry;
    for (const ref of registry.start()) {
      this.registerEvent(ref);
    }

    this.registerMarkdownCodeBlockProcessor("stream", (source, el, ctx) => {
      const child = new StreamChild(el, this.app, source, ctx.sourcePath);
      // Component.register runs on unload, so a closed note stops being refreshed.
      child.register(() => registry.unregister(child));
      registry.register(child);
      ctx.addChild(child);
    });
  }

  onunload(): void {
    this.registry?.stop();
    this.registry = null;
  }
}
```

- [ ] **Step 2: Verify the build and the full suite**

Run: `npm run build && npm test`
Expected: no TypeScript errors, `main.js` written, every test green.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: register the stream code block processor"
```

---

### Task 23: Test vault and manual verification

**Files:**
- Create: `test-vault/Journal/2026-09-02.md`, `test-vault/Journal/2026-09-03.md`, `test-vault/Journal/2026-09-04.md`
- Create: `test-vault/Books/dune.md`, `test-vault/Books/draft-idea.md`
- Create: `test-vault/Streams.md`
- Modify: `README.md` (usage and development sections)

The engine is covered by tests. This task covers what tests cannot see: real rendering, real links, real live updates.

- [ ] **Step 1: Write the sample notes**

`test-vault/Journal/2026-09-02.md`:

```markdown
---
date: 2026-09-02
tags: [daily]
mood: 3
---

# 2026-09-02

Set up the vault. Wrote the first stream block and immediately mistyped a field.
```

`test-vault/Journal/2026-09-03.md`:

```markdown
---
date: 2026-09-03
tags: [daily]
mood: 4
---

Read two chapters on the tram. The preview mode should show this line and then
trail off, which is the entire point of a preview.
```

`test-vault/Journal/2026-09-04.md`:

````markdown
---
date: 2026-09-04
tags: [daily, travel]
mood: 5
---

A long entry, so `display: full` has something to render:

- a list item
- another one

```js
console.log("a fenced block that a naive truncation would break");
```

Final paragraph.
````

`test-vault/Books/dune.md`:

```markdown
---
date: 2026-01-15
tags: [book, scifi]
rating: 5
status: done
---

Dune. Re-read for the fourth time.
```

`test-vault/Books/draft-idea.md`:

```markdown
---
date: 2026-02-01
tags: [book, draft]
status: todo
---

A half-formed idea that the draft exclusion should hide.
```

- [ ] **Step 2: Write the stream fixtures note**

`test-vault/Streams.md`. Each block exercises one thing, including the failures.

````markdown
# Stream fixtures

## Journal, grouped by day, previews

```stream
folder: Journal
date-field: date
sort: date desc
group: day
display: preview
preview-length: 120
```

## Journal, full render

```stream
folder: Journal
date-field: date
sort: date desc
display: full
limit: 3
```

## Titles only, oldest first

```stream
folder: Journal
date-field: date
sort: date asc
display: title
```

## Books above a rating, drafts excluded

```stream
folder: Books
exclude-tags: draft
where:
  rating: ">3"
  status: done
sort: rating desc
```

## Everything from the last 30 days, grouped by month

```stream
date-field: date
from: -30d
to: today
group: month
display: title
```

## Empty result — should show the query summary

```stream
tags: [nonexistent]
```

## Error — unknown field

```stream
tag: book
```

## Error — invalid YAML

```stream
folder: Journal
tags: [unclosed
```

## Error — bad value

```stream
display: everything
```
````

- [ ] **Step 3: Install the plugin into the test vault**

Run:

```bash
npm run build
mkdir -p test-vault/.obsidian/plugins/simple-streams
cp main.js manifest.json styles.css test-vault/.obsidian/plugins/simple-streams/
```

Then open `test-vault` in Obsidian, enable **Simple Streams** in Settings → Community plugins, and open `Streams.md` in reading view.

`.gitignore` already excludes `.obsidian/`, so the installed copy stays out of git.

- [ ] **Step 4: Walk the manual checklist**

Confirm each of these, and fix what fails before moving on:

- [ ] Day-grouped block shows three headers, newest first, each with a preview that trails off with an ellipsis.
- [ ] Group headers stay pinned while scrolling the block.
- [ ] `display: full` renders the list, the fenced code block, and the final paragraph — no raw frontmatter anywhere.
- [ ] `display: title` shows one row per note with no body.
- [ ] Ascending and descending blocks are exact mirrors of each other.
- [ ] Clicking a title opens that note; cmd/ctrl-click opens it in a new tab.
- [ ] The Books block shows only `dune`, proving `where` and the draft exclusion both bite.
- [ ] The relative-range block includes the September journal notes and excludes `dune` (January).
- [ ] The empty block shows "No notes match this stream." plus a readable query summary.
- [ ] The `tag: book` block shows "Unknown field `tag`. Did you mean `tags`?"
- [ ] The invalid-YAML block shows a parser message with a line number.
- [ ] The `display: everything` block lists the three valid modes.
- [ ] Editing `2026-09-04.md` and saving updates its preview in the stream within about a second, and the scroll position does not jump.
- [ ] Creating a new note in `Journal/` with a `date` adds it to the day-grouped stream.
- [ ] Deleting that note removes it from the stream.
- [ ] Renaming it updates the title shown in the stream.
- [ ] Both themes: switch between light and dark; every colour still reads correctly.

- [ ] **Step 5: Add usage and development docs to the README**

Replace `README.md` with:

````markdown
# Simple Streams

An Obsidian plugin that renders a filtered, sorted stream of notes wherever you
drop a `stream` code block.

Journal-shaped, but not journal-only: the filter decides what the stream is.

```stream
folder: Journal
tags: [book]
sort: date desc
group: day
display: preview
limit: 50
```

## Fields

| Field            | Type                     | Default           | Meaning |
| ---------------- | ------------------------ | ----------------- | ------- |
| `folder`         | text or list             | whole vault       | Path prefix, subfolders included |
| `tags`           | text or list             | —                 | All listed tags must be present |
| `tags-any`       | text or list             | —                 | At least one of the listed tags |
| `exclude-folder` | text or list             | —                 | Drop notes under these paths |
| `exclude-tags`   | text or list             | —                 | Drop notes carrying any of these tags |
| `title`          | text or `/regex/`        | —                 | Matches the note's file name |
| `where`          | map                      | —                 | Frontmatter conditions |
| `date-field`     | text                     | `file.ctime`      | Which field is "the date" |
| `from`, `to`     | date                     | —                 | Inclusive date bounds |
| `sort`           | text or list             | `file.ctime desc` | `"<field> <asc\|desc>"` |
| `group`          | `day\|month\|year\|none` | `none`            | Date headers |
| `display`        | `full\|preview\|title`   | `preview`         | How much of the body to show |
| `preview-length` | number                   | `200`             | Character budget for previews |
| `limit`          | number                   | `50`              | Maximum items |

Fields addressable in `sort` and `where`: any frontmatter key by name, plus
`file.ctime`, `file.mtime`, `file.name` and `file.path`.

A tag written with its hash must be quoted — `tags: ["#book"]` — because YAML
reads a bare `#` as a comment. Writing the tag without the hash needs no quotes.

`where` conditions: `field: value` (equality), `field: [a, b]` (any of),
`field: exists` / `field: missing`, and quoted comparisons —
`field: ">3"`, `">=3"`, `"<3"`, `"<=3"`, `"!=done"`. The quotes are required
because `field: >3` is not valid YAML. A field with no value matches only
`missing`.

Dates accept `YYYY-MM-DD`, `today`, `yesterday`, and signed offsets like `-30d`,
`-2w`, `-6m`, `+1y`. The sign is required — a bare `30d` is an error rather than
a guess at which direction you meant. Month and year offsets clamp to the end of
the target month, so one month before 31 March is 28 February.

## Development

```bash
npm install
npm test          # engine and parser tests
npm run dev       # watch build
npm run build     # type-check and bundle
```

`test-vault/` is a sample vault with a `Streams.md` page exercising every
display mode, grouping and error case. To try the plugin there:

```bash
npm run build
mkdir -p test-vault/.obsidian/plugins/simple-streams
cp main.js manifest.json styles.css test-vault/.obsidian/plugins/simple-streams/
```

Design: [docs/superpowers/specs/2026-09-04-simple-streams-design.md](docs/superpowers/specs/2026-09-04-simple-streams-design.md)
Plan: [docs/superpowers/plans/2026-09-04-simple-streams.md](docs/superpowers/plans/2026-09-04-simple-streams.md)
````

- [ ] **Step 6: Final verification**

Run: `npm run build && npm test`
Expected: no TypeScript errors, every test green.

- [ ] **Step 7: Commit**

```bash
git add test-vault README.md
git commit -m "test: add a sample vault and document usage"
```

---

## Spec coverage

| Spec section | Covered by |
| ------------ | ---------- |
| §3 query schema, every field | Tasks 7, 8, 9 |
| §3.1 field references, reserved `file.` prefix | Task 6 |
| §3.2 folder prefix and nested-tag matching | Task 10 |
| §3.3 `where` conditions, absent-field rule | Tasks 9, 11 |
| §3.4 date expressions, inclusive local-day bounds | Tasks 3, 11 |
| §3.5 sorting rules, grouping and header formats | Tasks 4, 12, 13 |
| §4 architecture and module boundaries | Tasks 2–17 (file layout), 22 (wiring) |
| §5 rendering, three display modes, lazy loading, empty state | Tasks 15, 16, 19, 20 |
| §6 live updates, signature check, scroll preservation | Tasks 20, 21 |
| §7 error handling, all four cases | Tasks 7–9 (messages), 18 (box), 19 (per-note), 21 (refresh) |
| §8 testing, `test-vault/` | Every task's tests; Task 23 |
| §9 build and packaging | Task 1 |
