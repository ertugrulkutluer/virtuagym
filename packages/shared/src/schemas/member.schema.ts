import { z } from "zod";

export const CreateMemberSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  cohort: z.string().max(40).optional(),
});
export type CreateMemberInput = z.infer<typeof CreateMemberSchema>;

export const UpdateMemberSchema = CreateMemberSchema.partial();
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>;

export const ListMembersQuerySchema = z.object({
  search: z.string().max(120).optional(),
  cohort: z.string().max(40).optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).optional(),
});
export type ListMembersQuery = z.infer<typeof ListMembersQuerySchema>;

export const GrantCreditsSchema = z.object({
  amount: z.coerce.number().int().min(1).max(500),
  expiresAt: z.string().datetime().optional(),
});
export type GrantCreditsInput = z.infer<typeof GrantCreditsSchema>;
