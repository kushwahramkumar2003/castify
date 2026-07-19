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

      // Razorpay SDK throws plain objects: { statusCode, error: { description } }
      if (
        error &&
        typeof error === "object" &&
        (error.statusCode || error.error?.description)
      ) {
        errorType = "Payment Provider Error";
        errorMessage =
          error.error?.description ||
          error.message ||
          `Upstream status ${error.statusCode ?? "unknown"}`;
      } else if (error?.code?.startsWith("P") || error?.name?.includes("Prisma")) {
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
      console.error(`[${errorType}] in ${contextName} ->`, errorMessage, error);
      const res = args[1];
      const next = args[2];

      const isExpressRes =
        res &&
        typeof res.status === "function" &&
        typeof res.json === "function";
      const isExpressNext = typeof next === "function";

      // Prefer JSON error responses over Express default HTML "[object Object]"
      if (isExpressRes && !res.headersSent) {
        // Never map payment-provider 401 to session Unauthorized
        const rawStatus =
          typeof error?.statusCode === "number" ? error.statusCode : 500;
        const status =
          errorType === "Payment Provider Error" || rawStatus === 401
            ? 502
            : rawStatus >= 400 && rawStatus < 600
              ? rawStatus
              : 500;
        res.status(status).json({
          success: false,
          message: errorMessage,
          type: errorType,
          details:
            process.env.NODE_ENV !== "production" ? errorMessage : undefined,
        });
        return;
      }

      if (isExpressNext) {
        return next(error instanceof Error ? error : new Error(errorMessage));
      }
      return undefined;
    }
  };
};
