import { Test } from "@nestjs/testing";
import { BloodworkClassifier } from "./classifier.service";

describe("BloodworkClassifier", () => {
  let classifier: BloodworkClassifier;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [BloodworkClassifier],
    }).compile();
    classifier = mod.get(BloodworkClassifier);
  });

  // The 20% borderline-margin rule: with refLow=70 / refHigh=99, mean=84.5,
  // span=29, margin=5.8 → NORMAL band is [78.7, 90.3]. We use those thresholds
  // as anchors for the band-edge tests so they stay deterministic.

  it("flags values below the lower reference as LOW", () => {
    const [r] = classifier.classify([
      { canonicalName: "glucose", label: "Glucose", value: 60, unit: "mg/dL" },
    ]);
    expect(r!.interpretation).toBe("LOW");
  });

  it("flags values above the upper reference as HIGH", () => {
    const [r] = classifier.classify([
      { canonicalName: "glucose", label: "Glucose", value: 120, unit: "mg/dL" },
    ]);
    expect(r!.interpretation).toBe("HIGH");
  });

  it("returns NORMAL when the value sits in the middle band", () => {
    const [r] = classifier.classify([
      { canonicalName: "glucose", label: "Glucose", value: 85, unit: "mg/dL" },
    ]);
    expect(r!.interpretation).toBe("NORMAL");
  });

  it("returns BORDERLINE_LOW when within range but below mean − 20% span", () => {
    // mean − margin = 78.7 → 75 is within [refLow=70, refHigh=99] but flagged
    const [r] = classifier.classify([
      { canonicalName: "glucose", label: "Glucose", value: 75, unit: "mg/dL" },
    ]);
    expect(r!.interpretation).toBe("BORDERLINE_LOW");
  });

  it("returns BORDERLINE_HIGH when within range but above mean + 20% span", () => {
    // mean + margin = 90.3 → 95 is within range but flagged
    const [r] = classifier.classify([
      { canonicalName: "glucose", label: "Glucose", value: 95, unit: "mg/dL" },
    ]);
    expect(r!.interpretation).toBe("BORDERLINE_HIGH");
  });

  it("returns UNKNOWN when no reference range can be derived", () => {
    const [r] = classifier.classify([
      {
        canonicalName: "totally-made-up-marker",
        label: "Mystery",
        value: 1,
        unit: "x",
      },
    ]);
    expect(r!.interpretation).toBe("UNKNOWN");
  });

  it("resolves a known alias back to the canonical marker name", () => {
    const [r] = classifier.classify([
      { canonicalName: "hgb", label: "Hgb", value: 16, unit: "g/dL" },
    ]);
    expect(r!.canonicalName).toBe("hemoglobin");
    expect(r!.category).toBe("hematology");
  });

  it("falls back to the label when canonicalName is unrecognised", () => {
    const [r] = classifier.classify([
      { canonicalName: "weird", label: "TSH", value: 2, unit: "mIU/L" },
    ]);
    expect(r!.canonicalName).toBe("tsh");
    expect(r!.interpretation).toBe("NORMAL");
  });

  it("prefers caller-provided refLow/refHigh over the catalog defaults", () => {
    // Catalog says glucose NORMAL at 85; here we narrow the range so 85 → HIGH.
    const [r] = classifier.classify([
      {
        canonicalName: "glucose",
        label: "Glucose",
        value: 85,
        unit: "mg/dL",
        refLow: 60,
        refHigh: 80,
      },
    ]);
    expect(r!.interpretation).toBe("HIGH");
    expect(r!.refHigh).toBe(80);
  });

  it("returns UNKNOWN when refHigh ≤ refLow (degenerate input)", () => {
    const [r] = classifier.classify([
      {
        canonicalName: "x",
        label: "X",
        value: 10,
        unit: "u",
        refLow: 50,
        refHigh: 50,
      },
    ]);
    expect(r!.interpretation).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for non-finite values", () => {
    const [r] = classifier.classify([
      {
        canonicalName: "glucose",
        label: "Glucose",
        value: Number.NaN,
        unit: "mg/dL",
      },
    ]);
    expect(r!.interpretation).toBe("UNKNOWN");
  });

  it("stratifies a mixed batch into the right buckets", () => {
    const buckets = classifier.stratify([
      { canonicalName: "glucose", label: "Glucose", value: 60, unit: "mg/dL" }, // LOW
      { canonicalName: "glucose", label: "Glucose", value: 120, unit: "mg/dL" }, // HIGH
      { canonicalName: "glucose", label: "Glucose", value: 85, unit: "mg/dL" }, // NORMAL
      { canonicalName: "glucose", label: "Glucose", value: 75, unit: "mg/dL" }, // BORDERLINE_LOW
      { canonicalName: "mystery", label: "Mystery", value: 1, unit: "x" }, // UNKNOWN
    ]);
    expect(buckets.outOfRange).toHaveLength(2);
    expect(buckets.borderline).toHaveLength(1);
    expect(buckets.normal).toHaveLength(1);
    expect(buckets.unknown).toHaveLength(1);
  });
});
