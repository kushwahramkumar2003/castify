import type { ZodTypeAny, z } from "zod";

export function createConfig<TSchema extends ZodTypeAny>(
  schema: TSchema,
  serviceName: string,
): z.infer<TSchema> {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    console.error(
      `❌  Invalid environment variables — ${serviceName} cannot start`,
    );
    console.error(
      JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
    );
    process.exit(1);
  }

  return parsed.data;
}
