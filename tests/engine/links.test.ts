import { describe, expect, it } from "vitest";
import { asLink, unwrapLink } from "../../src/engine/links";

describe("unwrapLink", () => {
  it("reduces a plain link to the note it names", () => {
    expect(unwrapLink("[[My Project]]")).toBe("My Project");
  });

  it("drops an alias", () => {
    expect(unwrapLink("[[My Project|MP]]")).toBe("My Project");
  });

  it("drops a heading", () => {
    expect(unwrapLink("[[My Project#Goals]]")).toBe("My Project");
  });

  it("drops a heading and an alias together", () => {
    expect(unwrapLink("[[My Project#Goals|MP]]")).toBe("My Project");
  });

  it("trims inside and outside the brackets", () => {
    expect(unwrapLink("  [[ My Project ]]  ")).toBe("My Project");
  });

  it("leaves text that is not a link alone", () => {
    expect(unwrapLink("My Project")).toBe("My Project");
    expect(unwrapLink("see [[My Project]]")).toBe("see [[My Project]]");
    expect(unwrapLink("[[a]] [[b]]")).toBe("[[a]] [[b]]");
  });

  it("leaves an embed alone", () => {
    expect(unwrapLink("![[My Project]]")).toBe("![[My Project]]");
  });

  it("leaves a bare heading link alone, having no note to name", () => {
    expect(unwrapLink("[[#Goals]]")).toBe("[[#Goals]]");
  });

  it("trims plain text too, so callers need no second trim", () => {
    expect(unwrapLink("  My Project  ")).toBe("My Project");
  });

  it("leaves empty brackets alone, by both routes that reach them", () => {
    // `[[]]` never matches — the capture needs a character — while `[[ ]]`
    // matches and then trims to nothing. Same answer, different paths.
    expect(unwrapLink("[[]]")).toBe("[[]]");
    expect(unwrapLink("[[ ]]")).toBe("[[ ]]");
  });
});

describe("asLink", () => {
  it("wraps plain text", () => {
    expect(asLink("My Project")).toBe("[[My Project]]");
  });

  it("unwraps first, so a link in, a link out", () => {
    expect(asLink("[[My Project]]")).toBe("[[My Project]]");
    expect(asLink("[[My Project|MP]]")).toBe("[[My Project]]");
    expect(asLink("[[My Project#Goals]]")).toBe("[[My Project]]");
  });

  it("takes the other scalars a property can hold", () => {
    expect(asLink(5)).toBe("[[5]]");
    expect(asLink(true)).toBe("[[true]]");
  });

  it("wraps text it cannot read as a link as it stands", () => {
    expect(asLink("![[My Project]]")).toBe("[[![[My Project]]]]");
    expect(asLink("[[#Goals]]")).toBe("[[[[#Goals]]]]");
  });
});
