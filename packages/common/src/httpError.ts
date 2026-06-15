/**
 * HTTP status codes commonly used across services.
 */
export type HttpStatusCode =
  | 200 // OK
  | 201 // Created
  | 204 // No Content
  | 400 // Bad Request
  | 401 // Unauthorized
  | 403 // Forbidden
  | 404 // Not Found
  | 409 // Conflict
  | 422 // Unprocessable Entity
  | 429 // Too Many Requests
  | 500 // Internal Server Error
  | 502 // Bad Gateway
  | 503; // Service Unavailable

/**
 * A structured, typed error class that carries an HTTP status code and an
 * optional machine-readable error `code` string (e.g. "USER_NOT_FOUND").
 *
 * @example
 * throw new HttpError(404, "User not found", "USER_NOT_FOUND");
 * throw new HttpError(400, "Email already in use", "EMAIL_CONFLICT");
 */
export class HttpError extends Error {
  public readonly statusCode: HttpStatusCode;
  /** Short machine-readable code, useful for clients to branch on (e.g. "USER_NOT_FOUND"). */
  public readonly code: string;

  constructor(
    statusCode: HttpStatusCode,
    message: string,
    code: string = "INTERNAL_ERROR"
  ) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;

    // Maintain proper prototype chain in TypeScript/Bun
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
