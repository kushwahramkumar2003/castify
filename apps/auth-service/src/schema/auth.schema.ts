import z from "zod";

const passwordValidation = z
  .string()
  .min(8, "Password must be at least 8 characters")
  // bcrypt only uses the first 72 bytes; accepting longer values silently
  // weakens the effective password and makes distinct passwords equivalent.
  .max(72, "Password must be at most 72 characters")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@!%*#?&]).{8,}$/,
    "Password must contain uppercase, lowercase, digit and special char (@!%*#?&)"
  );

export const signupPayload = z.object({
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      "Username must start with a letter and contain only letters, numbers, and underscores"
    ),
  fullName: z.string().min(1).max(100),
  email: z.string().email(),
  password: passwordValidation,
});

export const loginPayload = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const updateProfilePayload = z.object({
  fullName: z.string().min(1).max(100).optional(),
  bio: z.string().max(300).optional(),
  avatarUrl: z.string().url().max(500).optional(),
});

export const changePasswordPayload = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordValidation,
});
