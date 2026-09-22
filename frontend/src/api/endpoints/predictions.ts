import { request } from '../client'
import type { QueryParams } from '../queryString'
import type {
  Prediction,
  PredictionDecisionRequest,
  PredictionPage,
  PredictionRun,
  PredictionRunRequest,
  PredictionSettings,
  PredictionSettingsUpdateRequest,
  PredictionStatus,
  PredictionType,
} from '../types'

export interface ListPredictionsParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  from?: string
  to?: string
  type?: PredictionType
  status?: PredictionStatus
  storeId?: string
  partId?: string
  studentId?: string
  courseId?: string
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
}

/**
 * Rows the caller may not read (by type-based permission, or a mentor's
 * other students) are simply omitted by the backend, never filtered here.
 */
export function listPredictions(params: ListPredictionsParams = {}, signal?: AbortSignal): Promise<PredictionPage> {
  return request<PredictionPage>('/predictions', { method: 'GET', query: params, signal })
}

export function getPrediction(predictionId: string, signal?: AbortSignal): Promise<Prediction> {
  return request<Prediction>(`/predictions/${predictionId}`, { method: 'GET', signal })
}

/**
 * Advisory bookkeeping only: never places a purchase order, grades or
 * certifies a student, or makes a safety decision on its own.
 */
export function decidePrediction(
  predictionId: string,
  payload: PredictionDecisionRequest,
  signal?: AbortSignal,
): Promise<Prediction> {
  return request<Prediction>(`/predictions/${predictionId}/decisions`, { method: 'POST', body: payload, signal })
}

/**
 * Triggers the rule baseline now. The baseline always runs; the response's
 * `mlService` field reports whether the optional ML service was used,
 * unavailable-and-fell-back-to-rules, or not enabled at all.
 */
export function runPredictions(payload: PredictionRunRequest, signal?: AbortSignal): Promise<PredictionRun> {
  return request<PredictionRun>('/prediction-runs', { method: 'POST', body: payload, signal })
}

export function getPredictionSettings(signal?: AbortSignal): Promise<PredictionSettings> {
  return request<PredictionSettings>('/config/prediction-settings', { method: 'GET', signal })
}

export function replacePredictionSettings(
  payload: PredictionSettingsUpdateRequest,
  signal?: AbortSignal,
): Promise<PredictionSettings> {
  return request<PredictionSettings>('/config/prediction-settings', { method: 'PUT', body: payload, signal })
}
