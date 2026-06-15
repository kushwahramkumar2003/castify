import z from "zod";
export const signupPayload = z.object({
  username: z.string().min(4).max(50),
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .max(100)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@!%*#?&]).{8,}$/),
  fullName: z.string().min(2).max(100),
});

export const loginPayload = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
});
