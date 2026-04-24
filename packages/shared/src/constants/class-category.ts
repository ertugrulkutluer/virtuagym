export const ClassCategory = {
  HIIT: "HIIT",
  CARDIO: "CARDIO",
  STRENGTH: "STRENGTH",
  YOGA: "YOGA",
  MOBILITY: "MOBILITY",
  PILATES: "PILATES",
  CYCLING: "CYCLING",
  RECOVERY: "RECOVERY",
} as const;
export type ClassCategory = (typeof ClassCategory)[keyof typeof ClassCategory];

export const ALL_CLASS_CATEGORIES: ClassCategory[] = Object.values(ClassCategory);
