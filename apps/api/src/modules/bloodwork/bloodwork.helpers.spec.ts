import { MarkerInterpretation } from "@prisma/client";
import {
  normaliseMarkers,
  toPrismaInterpretation,
} from "./bloodwork.helpers";

describe("normaliseMarkers", () => {
  it("resolves canonical name from alias and dedupes", () => {
    const out = normaliseMarkers([
      { canonicalName: "hgb", label: "Hgb", value: 14, unit: "g/dL" },
      { canonicalName: "hemoglobin", label: "Hemoglobin", value: 14, unit: "g/dL" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.canonicalName).toBe("hemoglobin");
  });

  it("falls back to label when canonicalName is unknown", () => {
    const out = normaliseMarkers([
      { canonicalName: "unknown", label: "hgb", value: 14, unit: "g/dL" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.canonicalName).toBe("hemoglobin");
  });

  it("drops markers that match no catalog entry", () => {
    const out = normaliseMarkers([
      { canonicalName: "lol", label: "wat", value: 1, unit: "x" },
    ]);
    expect(out).toEqual([]);
  });

  it("keeps optional fields untouched", () => {
    const out = normaliseMarkers([
      {
        canonicalName: "ferritin",
        label: "Ferritin",
        value: 50,
        unit: "ng/mL",
        refLow: 30,
        refHigh: 400,
      },
    ]);
    expect(out[0]).toMatchObject({
      canonicalName: "ferritin",
      refLow: 30,
      refHigh: 400,
    });
  });
});

describe("toPrismaInterpretation", () => {
  it.each([
    ["LOW", MarkerInterpretation.LOW],
    ["BORDERLINE_LOW", MarkerInterpretation.BORDERLINE_LOW],
    ["NORMAL", MarkerInterpretation.NORMAL],
    ["BORDERLINE_HIGH", MarkerInterpretation.BORDERLINE_HIGH],
    ["HIGH", MarkerInterpretation.HIGH],
  ])("maps %s", (input, expected) => {
    expect(toPrismaInterpretation(input)).toBe(expected);
  });

  it("falls back to UNKNOWN for unrecognised input", () => {
    expect(toPrismaInterpretation("???")).toBe(MarkerInterpretation.UNKNOWN);
    expect(toPrismaInterpretation("")).toBe(MarkerInterpretation.UNKNOWN);
  });
});
