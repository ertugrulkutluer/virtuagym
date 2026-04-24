import { z } from "zod";
import { CheckInMethod } from "../constants/check-in-method";

export const CreateBookingSchema = z.object({
  classId: z.string().min(1),
});
export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;

export const CheckInSchema = z.object({
  method: z
    .enum([CheckInMethod.MANUAL, CheckInMethod.QR, CheckInMethod.AUTO])
    .optional(),
});
export type CheckInInput = z.infer<typeof CheckInSchema>;
