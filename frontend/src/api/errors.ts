import type { ApiErrorBody, ErrorCode, ErrorDetail } from './types'

/**
 * Typed representation of a backend error response, per the frozen
 * contract's `Error` schema. Thrown by the API client for any non-2xx
 * response and for network/parse failures.
 */
export class ApiError extends Error {
  readonly code: ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN_ERROR'
  readonly status: number
  readonly details?: ErrorDetail[]
  readonly requestId?: string
  readonly retryAfterSeconds?: number

  constructor(params: {
    message: string
    code: ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN_ERROR'
    status: number
    details?: ErrorDetail[]
    requestId?: string
    retryAfterSeconds?: number
  }) {
    super(params.message)
    this.name = 'ApiError'
    this.code = params.code
    this.status = params.status
    this.details = params.details
    this.requestId = params.requestId
    this.retryAfterSeconds = params.retryAfterSeconds
  }

  static fromBody(status: number, body: ApiErrorBody, retryAfterSeconds?: number): ApiError {
    return new ApiError({
      message: body.message,
      code: body.code,
      status,
      details: body.details,
      requestId: body.requestId,
      retryAfterSeconds,
    })
  }

  get isAuthError(): boolean {
    return this.status === 401
  }

  get isForbidden(): boolean {
    return this.status === 403
  }

  get isRateLimited(): boolean {
    return this.status === 429
  }
}
