export const BookingStatus = {
  ACTIVE: "ACTIVE",
  CANCELLED: "CANCELLED",
  WAITLISTED: "WAITLISTED",
  PROMOTED: "PROMOTED",
  CHECKED_IN: "CHECKED_IN",
  NO_SHOW: "NO_SHOW",
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

export const LIVE_BOOKING_STATUSES: BookingStatus[] = [
  "ACTIVE",
  "PROMOTED",
  "WAITLISTED",
  "CHECKED_IN",
];
