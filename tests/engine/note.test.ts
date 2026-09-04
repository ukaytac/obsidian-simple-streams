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
