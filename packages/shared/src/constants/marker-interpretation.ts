export const MarkerInterpretation = {
  LOW: "LOW",
  BORDERLINE_LOW: "BORDERLINE_LOW",
  NORMAL: "NORMAL",
  BORDERLINE_HIGH: "BORDERLINE_HIGH",
  HIGH: "HIGH",
  UNKNOWN: "UNKNOWN",
} as const;
export type MarkerInterpretation =
  (typeof MarkerInterpretation)[keyof typeof MarkerInterpretation];

export const OUT_OF_RANGE_INTERPRETATIONS: MarkerInterpretation[] = [
  "LOW",
  "HIGH",
];
export const ATTENTION_INTERPRETATIONS: MarkerInterpretation[] = [
  "LOW",
  "HIGH",
  "BORDERLINE_LOW",
  "BORDERLINE_HIGH",
];
