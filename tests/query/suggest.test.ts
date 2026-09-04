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
