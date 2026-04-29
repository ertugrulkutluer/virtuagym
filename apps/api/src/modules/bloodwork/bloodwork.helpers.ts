import { MarkerInterpretation } from "@prisma/client";
import {
  resolveCanonicalMarkerName,
  type CreateBloodTestReportInput,
} from "@gymflow/shared";

export function normaliseMarkers(
  inputs: CreateBloodTestReportInput["markers"],
): CreateBloodTestReportInput["markers"] {
  const out: CreateBloodTestReportInput["markers"] = [];
  const seen = new Set<string>();
  for (const m of inputs) {
    const canonical =
      resolveCanonicalMarkerName(m.canonicalName) ??
      resolveCanonicalMarkerName(m.label);
    if (!canonical) continue;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push({ ...m, canonicalName: canonical });
  }
  return out;
}

export function toPrismaInterpretation(i: string): MarkerInterpretation {
  switch (i) {
    case "LOW":
      return MarkerInterpretation.LOW;
    case "BORDERLINE_LOW":
      return MarkerInterpretation.BORDERLINE_LOW;
    case "NORMAL":
      return MarkerInterpretation.NORMAL;
    case "BORDERLINE_HIGH":
      return MarkerInterpretation.BORDERLINE_HIGH;
    case "HIGH":
      return MarkerInterpretation.HIGH;
    default:
      return MarkerInterpretation.UNKNOWN;
  }
}
