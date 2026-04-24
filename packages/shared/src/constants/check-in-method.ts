export const CheckInMethod = {
  MANUAL: "MANUAL",
  QR: "QR",
  AUTO: "AUTO",
} as const;
export type CheckInMethod = (typeof CheckInMethod)[keyof typeof CheckInMethod];
