/**
 * Canonical marker catalog. The extractor/classifier normalizes any incoming
 * label against this list (case-insensitive, trimmed, alias-matched) and
 * looks up reference ranges + exercise-relevance tags.
 *
 * Reference ranges are rough adult general-population values — good enough
 * for a demo; a real clinical product would pull age/sex-specific ranges.
 */

export type MarkerCategory =
  | "hematology"
  | "iron"
  | "metabolic"
  | "lipid"
  | "thyroid"
  | "vitamin"
  | "inflammation"
  | "kidney"
  | "liver"
  | "electrolyte";

export interface MarkerDef {
  canonicalName: string;
  label: string;
  category: MarkerCategory;
  unit: string;
  refLow: number;
  refHigh: number;
  aliases: string[];
  /** Markers that tend to be read together clinically. */
  relatedTo?: string[];
  /** Short note about exercise relevance — used in LLM prompt context. */
  exerciseRelevance?: string;
}

export const MARKER_CATALOG: MarkerDef[] = [
  // Hematology
  {
    canonicalName: "hemoglobin",
    label: "Hemoglobin",
    category: "hematology",
    unit: "g/dL",
    refLow: 13.5,
    refHigh: 17.5,
    aliases: ["hgb", "hb", "haemoglobin", "hemoglobin"],
    relatedTo: ["ferritin", "iron"],
    exerciseRelevance:
      "Low hemoglobin reduces oxygen delivery — endurance and HIIT will feel harder; favor lighter aerobic + recovery work.",
  },
  {
    canonicalName: "hematocrit",
    label: "Hematocrit",
    category: "hematology",
    unit: "%",
    refLow: 38.8,
    refHigh: 50,
    aliases: ["hct", "haematocrit"],
    relatedTo: ["hemoglobin"],
  },

  // Iron panel
  {
    canonicalName: "ferritin",
    label: "Ferritin",
    category: "iron",
    unit: "ng/mL",
    refLow: 24,
    refHigh: 336,
    aliases: ["ferritin", "serum ferritin"],
    relatedTo: ["hemoglobin", "iron"],
    exerciseRelevance:
      "Low ferritin (iron stores) impairs recovery and endurance; avoid back-to-back HIIT days.",
  },
  {
    canonicalName: "iron",
    label: "Serum Iron",
    category: "iron",
    unit: "ug/dL",
    refLow: 60,
    refHigh: 170,
    aliases: ["iron", "serum iron", "fe"],
    relatedTo: ["ferritin"],
  },

  // Metabolic
  {
    canonicalName: "glucose",
    label: "Fasting Glucose",
    category: "metabolic",
    unit: "mg/dL",
    refLow: 70,
    refHigh: 99,
    aliases: ["glucose", "fasting glucose", "blood glucose", "fbg"],
    exerciseRelevance:
      "Persistently high fasting glucose benefits from regular moderate cardio + strength.",
  },
  {
    canonicalName: "hba1c",
    label: "HbA1c",
    category: "metabolic",
    unit: "%",
    refLow: 4,
    refHigh: 5.6,
    aliases: ["hba1c", "a1c", "glycated hemoglobin"],
  },

  // Lipids
  {
    canonicalName: "total_cholesterol",
    label: "Total Cholesterol",
    category: "lipid",
    unit: "mg/dL",
    refLow: 125,
    refHigh: 200,
    aliases: ["cholesterol", "total cholesterol", "tc"],
  },
  {
    canonicalName: "hdl",
    label: "HDL",
    category: "lipid",
    unit: "mg/dL",
    refLow: 40,
    refHigh: 90,
    aliases: ["hdl", "hdl-c", "hdl cholesterol"],
    exerciseRelevance:
      "Consistent cardio + HIIT tends to raise HDL over months.",
  },
  {
    canonicalName: "ldl",
    label: "LDL",
    category: "lipid",
    unit: "mg/dL",
    refLow: 0,
    refHigh: 129,
    aliases: ["ldl", "ldl-c", "ldl cholesterol"],
  },
  {
    canonicalName: "triglycerides",
    label: "Triglycerides",
    category: "lipid",
    unit: "mg/dL",
    refLow: 0,
    refHigh: 149,
    aliases: ["triglycerides", "tg"],
  },

  // Thyroid
  {
    canonicalName: "tsh",
    label: "TSH",
    category: "thyroid",
    unit: "mIU/L",
    refLow: 0.4,
    refHigh: 4.0,
    aliases: ["tsh", "thyroid stimulating hormone"],
    exerciseRelevance:
      "High TSH (underactive thyroid) can blunt recovery; prioritize mobility + moderate strength.",
  },

  // Vitamins
  {
    canonicalName: "vitamin_d",
    label: "Vitamin D (25-OH)",
    category: "vitamin",
    unit: "ng/mL",
    refLow: 30,
    refHigh: 100,
    aliases: ["vitamin d", "25-oh vitamin d", "25(oh)d", "vit d"],
    exerciseRelevance:
      "Low vitamin D correlates with muscle weakness and slower recovery.",
  },
  {
    canonicalName: "vitamin_b12",
    label: "Vitamin B12",
    category: "vitamin",
    unit: "pg/mL",
    refLow: 232,
    refHigh: 1245,
    aliases: ["vitamin b12", "b12", "cobalamin"],
  },

  // Inflammation
  {
    canonicalName: "crp",
    label: "C-Reactive Protein",
    category: "inflammation",
    unit: "mg/L",
    refLow: 0,
    refHigh: 3,
    aliases: ["crp", "c reactive protein", "c-reactive protein", "hs-crp"],
    exerciseRelevance:
      "Elevated CRP suggests systemic inflammation — favor recovery + low-intensity work for a week.",
  },

  // Kidney
  {
    canonicalName: "creatinine",
    label: "Creatinine",
    category: "kidney",
    unit: "mg/dL",
    refLow: 0.7,
    refHigh: 1.3,
    aliases: ["creatinine", "crea"],
  },

  // Liver
  {
    canonicalName: "alt",
    label: "ALT",
    category: "liver",
    unit: "U/L",
    refLow: 7,
    refHigh: 56,
    aliases: ["alt", "sgpt", "alanine aminotransferase"],
  },
  {
    canonicalName: "ast",
    label: "AST",
    category: "liver",
    unit: "U/L",
    refLow: 10,
    refHigh: 40,
    aliases: ["ast", "sgot", "aspartate aminotransferase"],
  },

  // Electrolytes
  {
    canonicalName: "sodium",
    label: "Sodium",
    category: "electrolyte",
    unit: "mmol/L",
    refLow: 135,
    refHigh: 145,
    aliases: ["sodium", "na"],
  },
  {
    canonicalName: "potassium",
    label: "Potassium",
    category: "electrolyte",
    unit: "mmol/L",
    refLow: 3.5,
    refHigh: 5.1,
    aliases: ["potassium", "k"],
  },
];

const aliasToCanonical = new Map<string, string>();
for (const m of MARKER_CATALOG) {
  aliasToCanonical.set(m.canonicalName.toLowerCase(), m.canonicalName);
  for (const alias of m.aliases) {
    aliasToCanonical.set(alias.toLowerCase().trim(), m.canonicalName);
  }
}

export function resolveCanonicalMarkerName(input: string): string | null {
  if (!input) return null;
  const key = input.toLowerCase().trim().replace(/\s+/g, " ");
  return aliasToCanonical.get(key) ?? null;
}

const byCanonical = new Map(MARKER_CATALOG.map((m) => [m.canonicalName, m]));

export function getMarkerDef(canonicalName: string): MarkerDef | undefined {
  return byCanonical.get(canonicalName);
}
