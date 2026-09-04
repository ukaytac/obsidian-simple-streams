import { describe, expect, it } from "vitest";
import { editDistance, nearestField } from "../../src/query/suggest";

const FIELDS = ["folder", "tags", "tags-any", "exclude-folder", "sort", "group", "display", "limit"];

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
});
