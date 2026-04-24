import { z } from "zod";

/**
 * Contract the Grok advisor must return. We instruct the model to produce
 * strictly this JSON, then parse it server-side; any deviation throws.
 */
export const NoShowAdvisorResponseSchema = z.object({
  expectedAttendance: z.number().min(0),
  expectedNoShows: z.number().min(0),
  overbookRecommendation: z.enum(["ALLOW", "DENY"]),
  riskBand: z.enum(["LOW", "MEDIUM", "HIGH"]),
  rationale: z.string().min(1).max(600),
  perBooking: z.array(
    z.object({
      bookingId: z.string(),
      showProbability: z.number().min(0).max(1),
      note: z.string().max(160).optional(),
    }),
  ),
});
export type NoShowAdvisorResponse = z.infer<typeof NoShowAdvisorResponseSchema>;

export const AiToggleSchema = z.object({
  enabled: z.boolean().optional(),
  overbookFactor: z.coerce.number().min(0.5).max(1.2).optional(),
});
export type AiToggleInput = z.infer<typeof AiToggleSchema>;
