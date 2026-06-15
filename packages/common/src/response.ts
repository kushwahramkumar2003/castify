// Minimal interface that covers what we need from express.Response
// This avoids importing express directly from the shared package,
// preventing version-mismatch issues across workspace consumers.
export interface ExpressResponse {
  status(code: number): this;
  json(body: unknown): this;
  send(body?: unknown): this;
}

// ─── Default messages per status code ────────────────────────────────────────

const DEFAULT_SUCCESS_MESSAGES: Record<number, string> = {
  200: "Success",
  201: "Created successfully",
  204: "Deleted successfully",
};

const DEFAULT_ERROR_MESSAGES: Record<number, string> = {
  400: "Bad request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not found",
  409: "Conflict",
  422: "Validation failed",
  429: "Too many requests",
  500: "Something went wrong",
  502: "Bad gateway",
  503: "Service unavailable",
};

// ─── castifyResponse ──────────────────────────────────────────────────────────

/**
 * Send a success response. Dead simple.
 *
 * @param res     - Express response object
 * @param data    - Any payload to send back (object, array, null for 204)
 * @param message - (optional) Defaults to "Success" / "Created successfully" etc.
 * @param status  - (optional) HTTP status code. Defaults to 200.
 *
 * @example
 * castifyResponse(res, users)                            // 200 "Success"
 * castifyResponse(res, user, STATUS_MSG.SIGNUP_SUCCESS, STATUS_CODE.CREATED)
 * castifyResponse(res, null, STATUS_MSG.NO_CONTENT, STATUS_CODE.NO_CONTENT)
 */
export function castifyResponse<T>(
  res: ExpressResponse,
  data: T,
  message?: string,
  status: number = 200
): void {
  const msg = message ?? DEFAULT_SUCCESS_MESSAGES[status] ?? "Success";

  if (status === 204) {
    res.status(204).send();
    return;
  }

  res.status(status).json({
    success: true,
    message: msg,
    data,
  });
}

// ─── castifyError ─────────────────────────────────────────────────────────────

/**
 * Send an error response. Dead simple.
 *
 * @param res     - Express response object
 * @param message - (optional) Auto-filled from status code if omitted.
 * @param status  - (optional) HTTP status code. Defaults to 500.
 * @param errors  - (optional) Field-level validation errors { field: ["msg"] }
 *
 * @example
 * castifyError(res)                                                             // 500
 * castifyError(res, STATUS_MSG.NOT_FOUND, STATUS_CODE.NOT_FOUND)               // 404
 * castifyError(res, STATUS_MSG.VALIDATION_FAILED, STATUS_CODE.UNPROCESSABLE,   // 422 + fields
 *   zodErrors(parsed.error))
 */
export function castifyError(
  res: ExpressResponse,
  message?: string,
  status: number = 500,
  errors?: Record<string, string[]>
): void {
  const msg = message ?? DEFAULT_ERROR_MESSAGES[status] ?? "Something went wrong";

  const body: Record<string, unknown> = {
    success: false,
    message: msg,
    status,
  };

  if (errors && Object.keys(errors).length > 0) {
    body["errors"] = errors;
  }

  res.status(status).json(body);
}

// ─── Zod helper ───────────────────────────────────────────────────────────────

/**
 * Converts a Zod parse error into the errors shape that castifyError accepts.
 *
 * @example
 * const parsed = mySchema.safeParse(req.body);
 * if (!parsed.success) {
 *   return castifyError(res, STATUS_MSG.VALIDATION_FAILED, STATUS_CODE.UNPROCESSABLE,
 *     zodErrors(parsed.error));
 * }
 */
export function zodErrors(
  zodError: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }
): Record<string, string[]> {
  const raw = zodError.flatten().fieldErrors;
  const result: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(raw)) {
    if (messages && messages.length > 0) result[key] = messages;
  }
  return result;
}
