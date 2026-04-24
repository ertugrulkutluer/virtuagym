import { z } from "zod";

export const CreateClassSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  startsAt: z.string().datetime(),
  durationMinutes: z.number().int().min(5).max(12 * 60),
  capacity: z.number().int().min(1).max(500),
  creditCost: z.number().int().min(0).max(50).default(1).optional(),
  trainerId: z.string().optional(),
  location: z.string().max(200).optional(),
  cancelled: z.boolean().optional(),
});
export type CreateClassInput = z.infer<typeof CreateClassSchema>;

export const UpdateClassSchema = CreateClassSchema.partial();
export type UpdateClassInput = z.infer<typeof UpdateClassSchema>;

export const ListClassesQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  includeCancelled: z.coerce.boolean().optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});
export type ListClassesQuery = z.infer<typeof ListClassesQuerySchema>;
