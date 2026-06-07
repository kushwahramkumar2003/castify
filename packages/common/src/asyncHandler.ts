// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAsyncFunction = (...args: any[]) => Promise<any>;

export const asyncHandler = <T extends AnyAsyncFunction>(
  fn: T,
  contextName: string = "Operation"
) => {
  return async (...args: Parameters<T>): Promise<ReturnType<T> | void> => {
    try {
      return await fn(...args);
    } catch (error: any) {
      let errorType = "Unknown Error";
      let errorMessage = error?.message || String(error);
      if (error?.code?.startsWith("P") || error?.name?.includes("Prisma")) {
        errorType = "Prisma DB Error";
        errorMessage = `[Code: ${error.code || "N/A"}] ${errorMessage}`;
      } else if (
        errorMessage.toLowerCase().includes("redis") ||
        error?.name?.includes("Redis") ||
        error?.code === "ECONNREFUSED"
      ) {
        errorType = "Redis Error";
      } else if (error instanceof TypeError || error?.name === "TypeError") {
        errorType = "Type Error";
      } else if (error?.isAxiosError || error?.response) {
        errorType = "Network Error";
        errorMessage = `[Status: ${error.response?.status}] ${errorMessage}`;
      } else if (error instanceof Error) {
        errorType = "Runtime Error";
      }
      console.error(`[${errorType}] in ${contextName} ->`, errorMessage);
      const res = args[1];
      const next = args[2];

      const isExpressRes =
        res &&
        typeof res.status === "function" &&
        typeof res.json === "function";
      const isExpressNext = typeof next === "function";

      if (isExpressNext) {
        return next(error);
      } else if (isExpressRes) {
        res.status(500).json({
          success: false,
          error: "Internal Server Error",
          type: errorType,
          details:
            process.env.NODE_ENV !== "production" ? errorMessage : undefined,
        });
        return;
      }
      return undefined;
    }
  };
};
