// =============================================================================
// Prisma client singleton — import this from "@castify/db" in any service.
// =============================================================================
// Bun's module cache ensures this file runs exactly once per process.
// Every service that imports { prisma } gets the same connected instance.
// =============================================================================

import { PrismaClient } from "../generated/prisma/index.js";

const globalForPrisma = globalThis as unknown as {
  __castifyPrisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.__castifyPrisma ??
  (globalForPrisma.__castifyPrisma = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  }));

// ---------------------------------------------------------------------------
// Graceful shutdown helper — call from your service's SIGTERM handler.
// Usage:
//   import { disconnectPrisma } from "@castify/db";
//   process.on("SIGTERM", async () => { await disconnectPrisma(); });
// ---------------------------------------------------------------------------
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
