import { describe, expect, it } from "vitest";
import { baloziOptionLabel } from "./display";

describe("Balozi display labels", () => {
  it("shows the area and leader as separate, understandable values", () => {
    expect(baloziOptionLabel({ name: "Kitalu A", balozi_name: "Asha Juma" })).toBe(
      "Kitalu A — Jina la Balozi: Asha Juma",
    );
  });

  it("makes a missing leader name explicit", () => {
    expect(baloziOptionLabel({ name: "Kitalu B", balozi_name: "" })).toBe(
      "Kitalu B — Jina la Balozi: Hajatajwa",
    );
  });
});
