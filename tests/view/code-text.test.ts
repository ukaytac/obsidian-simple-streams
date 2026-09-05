// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
// Imported for its side effect: the harness installs Obsidian's element
// helpers (`createEl`, `appendText`, `empty`) onto the jsdom prototypes.
import "./harness";
import { setCodeText } from "../../src/view/codeText";

/** What the reader sees, with code spans marked, so a test can assert both. */
function shape(el: HTMLElement): string {
  return Array.from(el.childNodes)
    .map((node) =>
      node.nodeType === Node.TEXT_NODE ? (node.textContent ?? "") : `<${node.textContent ?? ""}>`,
    )
    .join("");
}

let el: HTMLElement;

beforeEach(() => {
  document.body.replaceChildren();
  el = document.createElement("div");
  document.body.appendChild(el);
});

describe("setCodeText", () => {
  test("a backtick span becomes a code element, and the backticks go away", () => {
    setCodeText(el, "No note here has a usable `date`, so this stream falls back.");

    expect(el.textContent).toBe("No note here has a usable date, so this stream falls back.");
    expect(Array.from(el.querySelectorAll("code")).map((c) => c.textContent)).toEqual(["date"]);
    expect(shape(el)).toBe("No note here has a usable <date>, so this stream falls back.");
  });

  test("several spans in one message", () => {
    setCodeText(el, "`where.nights` has an empty value. Quote it, as in `nights: \">3\"`.");

    expect(Array.from(el.querySelectorAll("code")).map((c) => c.textContent)).toEqual([
      "where.nights",
      'nights: ">3"',
    ]);
    expect(el.textContent).toBe('where.nights has an empty value. Quote it, as in nights: ">3".');
  });

  test("a message with no backticks is written as it stands", () => {
    setCodeText(el, "No notes match this stream.");

    expect(el.textContent).toBe("No notes match this stream.");
    expect(el.querySelector("code")).toBeNull();
  });

  /**
   * The case that decides the parser's shape. Treating an unpaired backtick as
   * opening a span would set the whole tail in monospace; dropping it would
   * silently edit the message. A failure explanation is the last text that
   * should be quietly rewritten, so the backtick stays as a character.
   */
  test("an unpaired backtick stays a literal backtick", () => {
    setCodeText(el, "Something went wrong with `sort and the rest of the sentence.");

    expect(el.textContent).toBe("Something went wrong with `sort and the rest of the sentence.");
    expect(el.querySelector("code")).toBeNull();
  });

  test("a span at the very start and one at the very end both close", () => {
    setCodeText(el, "`sort` needs a field, unlike `group`");

    expect(shape(el)).toBe("<sort> needs a field, unlike <group>");
  });

  test("writing twice replaces, rather than appending to, what was there", () => {
    setCodeText(el, "first `one`");
    setCodeText(el, "second `two`");

    expect(el.textContent).toBe("second two");
    expect(Array.from(el.querySelectorAll("code")).map((c) => c.textContent)).toEqual(["two"]);
  });
});
