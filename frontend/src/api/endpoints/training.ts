import { request } from '../client'
import type { ApiOperations, Permission } from '../types'
import type { QueryParams } from '../queryString'
import { trainingContract } from './trainingContract'

export type TrainingOperation = keyof typeof trainingContract
export type TrainingRequest<K extends TrainingOperation> = ApiOperations[K] extends {
  requestBody: { content: { 'application/json': infer B } }
}
  ? B
  : undefined
type JsonResponse<T> = T extends { content: { 'application/json': infer R } } ? R : never
export type TrainingResponse<K extends TrainingOperation> = JsonResponse<
  ApiOperations[K]['responses'][keyof ApiOperations[K]['responses'] & (200 | 201)]
>

export interface FieldSchema {
  type?: string
  format?: string
  enum?: readonly string[]
  properties?: Readonly<Record<string, FieldSchema>>
  required?: readonly string[]
  items?: FieldSchema
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
  pattern?: string
}
export interface OperationMetadata {
  path: string
  method: 'GET' | 'POST' | 'PATCH' | 'PUT'
  permissions: readonly Permission[]
  pathParams: readonly string[]
  query: FieldSchema
  body?: FieldSchema
  response: FieldSchema
}
export const trainingOperations: Record<TrainingOperation, OperationMetadata> = trainingContract

export function callTraining<K extends TrainingOperation>(
  operation: K,
  params: Record<string, string> = {},
  query?: QueryParams,
  body?: TrainingRequest<K>,
  signal?: AbortSignal,
  idempotencyKey?: string,
): Promise<TrainingResponse<K>> {
  const meta = trainingOperations[operation]
  const path = meta.path.replace(/\{(\w+)\}/g, (_, key: string) => {
    if (!params[key]) throw new Error(`Missing path parameter: ${key}`)
    return encodeURIComponent(params[key])
  })
  return request(path, {
    method: meta.method,
    query,
    body,
    signal,
    anonymous: operation === 'verifyCertificate',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
  })
}
