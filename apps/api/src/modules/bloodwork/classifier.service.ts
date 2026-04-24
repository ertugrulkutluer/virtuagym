import { Injectable } from "@nestjs/common";
import {
  MARKER_CATALOG,
  MarkerInterpretation,
  getMarkerDef,
  resolveCanonicalMarkerName,
  type MarkerDef,
  type RawBloodMarkerInput,
} from "@gymflow/shared";

const BORDERLINE_MARGIN_FRACTION = 0.2;

export interface ClassifiedMarker {
  canonicalName: string;
  label: string;
  value: number;
  unit: string;
  refLow: number | null;
  refHigh: number | null;
  interpretation: MarkerInterpretation;
  category: MarkerDef["category"] | "unknown";
}

export interface StratifiedMarkers {
  outOfRange: ClassifiedMarker[]; // LOW or HIGH
  borderline: ClassifiedMarker[]; // BORDERLINE_LOW or BORDERLINE_HIGH
  normal: ClassifiedMarker[]; // NORMAL
  unknown: ClassifiedMarker[]; // unrecognised or missing refs
}

/**
 * Pure rule-based blood-marker classifier — no LLM.
 * Maps each input marker to an interpretation band using reference ranges
 * plus a 20% margin rule (a value inside the range but beyond mean ± 20% of
 * the range-span is flagged as borderline — same pattern BloodKnows uses).
 */
@Injectable()
export class BloodworkClassifier {
  classify(markers: RawBloodMarkerInput[]): ClassifiedMarker[] {
    return markers.map((m) => this.classifyOne(m));
  }

  stratify(markers: RawBloodMarkerInput[]): StratifiedMarkers {
    const classified = this.classify(markers);
    const buckets: StratifiedMarkers = {
      outOfRange: [],
      borderline: [],
      normal: [],
      unknown: [],
    };
    for (const c of classified) {
      switch (c.interpretation) {
        case "LOW":
        case "HIGH":
          buckets.outOfRange.push(c);
          break;
        case "BORDERLINE_LOW":
        case "BORDERLINE_HIGH":
          buckets.borderline.push(c);
          break;
        case "NORMAL":
          buckets.normal.push(c);
          break;
        default:
          buckets.unknown.push(c);
      }
    }
    return buckets;
  }

  private classifyOne(input: RawBloodMarkerInput): ClassifiedMarker {
    const canonical =
      resolveCanonicalMarkerName(input.canonicalName) ??
      resolveCanonicalMarkerName(input.label) ??
      input.canonicalName;
    const def = getMarkerDef(canonical);
    const refLow = input.refLow ?? def?.refLow ?? null;
    const refHigh = input.refHigh ?? def?.refHigh ?? null;

    const interpretation = this.interpret(input.value, refLow, refHigh);
    return {
      canonicalName: canonical,
      label: input.label,
      value: input.value,
      unit: input.unit,
      refLow,
      refHigh,
      interpretation,
      category: def?.category ?? "unknown",
    };
  }

  private interpret(
    value: number,
    refLow: number | null,
    refHigh: number | null,
  ): MarkerInterpretation {
    if (refLow == null || refHigh == null || !Number.isFinite(value)) {
      return "UNKNOWN";
    }
    if (refHigh <= refLow) return "UNKNOWN";

    if (value < refLow) return "LOW";
    if (value > refHigh) return "HIGH";

    const mean = (refLow + refHigh) / 2;
    const span = refHigh - refLow;
    const margin = span * BORDERLINE_MARGIN_FRACTION;

    if (value < mean - margin) return "BORDERLINE_LOW";
    if (value > mean + margin) return "BORDERLINE_HIGH";
    return "NORMAL";
  }

  catalog() {
    return MARKER_CATALOG;
  }
}
