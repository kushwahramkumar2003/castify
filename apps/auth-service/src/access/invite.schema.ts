import { z } from "zod";

export const createInviteSchema = z.object({
  kind: z.enum(["CODE", "LINK"]).default("CODE"),
  label: z.string().trim().max(80).optional(),
  maxUses: z.number().int().min(1).max(10_000).optional().nullable(),
  expiresInHours: z.number().int().min(1).max(720).optional().nullable(),
});

export const redeemInviteSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4)
    .max(64)
    .transform((v) => v.toUpperCase().replace(/\s+/g, "")),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type RedeemInviteInput = z.infer<typeof redeemInviteSchema>;
