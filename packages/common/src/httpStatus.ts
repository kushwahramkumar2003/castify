export const STATUS_CODE = {
  // 2xx Success
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,

  // 3xx Redirection
  MOVED_PERMANENTLY: 301,
  NOT_MODIFIED: 304,

  // 4xx Client Errors
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  GONE: 410,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,

  // 5xx Server Errors
  INTERNAL_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

export type StatusCode = (typeof STATUS_CODE)[keyof typeof STATUS_CODE];



export const STATUS_NAME = {
  // 2xx
  OK: "OK",
  CREATED: "CREATED",
  ACCEPTED: "ACCEPTED",
  NO_CONTENT: "NO_CONTENT",

  // 3xx
  MOVED_PERMANENTLY: "MOVED_PERMANENTLY",
  NOT_MODIFIED: "NOT_MODIFIED",

  // 4xx
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  CONFLICT: "CONFLICT",
  GONE: "GONE",
  UNPROCESSABLE: "UNPROCESSABLE",
  TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",

  // 5xx
  INTERNAL_ERROR: "INTERNAL_ERROR",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  BAD_GATEWAY: "BAD_GATEWAY",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  GATEWAY_TIMEOUT: "GATEWAY_TIMEOUT",
} as const;

export type StatusName = (typeof STATUS_NAME)[keyof typeof STATUS_NAME];

export const STATUS_MSG = {
  // ── Success ────────────────────────────────────────────────────────────────
  OK: "Request completed successfully",
  CREATED: "Resource created successfully",
  ACCEPTED: "Request accepted and is being processed",
  NO_CONTENT: "Resource deleted successfully",

  // ── Auth ───────────────────────────────────────────────────────────────────
  SIGNUP_SUCCESS: "Account created successfully",
  LOGIN_SUCCESS: "Logged in successfully",
  LOGOUT_SUCCESS: "Logged out successfully",
  TOKEN_REFRESHED: "Access token refreshed",
  PASSWORD_CHANGED: "Password changed successfully",
  PASSWORD_RESET_SENT: "Password reset link sent to your email",

  // ── User ───────────────────────────────────────────────────────────────────
  PROFILE_FETCHED: "Profile fetched successfully",
  PROFILE_UPDATED: "Profile updated successfully",
  AVATAR_UPDATED: "Avatar updated successfully",

  // ── Stream ─────────────────────────────────────────────────────────────────
  STREAM_STARTED: "Stream started successfully",
  STREAM_ENDED: "Stream ended",
  STREAM_FETCHED: "Stream details fetched",

  // ── 4xx Errors ─────────────────────────────────────────────────────────────
  BAD_REQUEST: "Invalid request",
  VALIDATION_FAILED: "Validation failed — check the errors field",
  UNAUTHORIZED: "You must be logged in to do that",
  FORBIDDEN: "You do not have permission to perform this action",
  NOT_FOUND: "The requested resource was not found",
  METHOD_NOT_ALLOWED: "HTTP method not allowed",
  EMAIL_CONFLICT: "An account with that email already exists",
  USERNAME_CONFLICT: "That username is already taken",
  CONFLICT: "This resource already exists",
  GONE: "This resource no longer exists",
  UNPROCESSABLE: "The request data could not be processed",
  TOO_MANY_REQUESTS: "Too many requests — please slow down and try again later",

  // ── 5xx Errors ─────────────────────────────────────────────────────────────
  INTERNAL_ERROR: "Something went wrong on our end",
  NOT_IMPLEMENTED: "This feature is not yet implemented",
  BAD_GATEWAY: "Upstream service returned an invalid response",
  SERVICE_UNAVAILABLE: "Service is temporarily unavailable",
  GATEWAY_TIMEOUT: "The upstream service timed out",
} as const;

export type StatusMsg = (typeof STATUS_MSG)[keyof typeof STATUS_MSG];
