import { request } from '../client'
import type { QueryParams } from '../queryString'
import type {
  PartIssue,
  PartIssueCreateRequest,
  PartIssuePage,
  PartIssueReversal,
  PartIssueReversalRequest,
  PartReservation,
  PartReservationCreateRequest,
  PartReservationPage,
} from '../types'

export interface ListPartIssuesParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
}

export function listPartIssues(
  jobId: string,
  params: ListPartIssuesParams = {},
  signal?: AbortSignal,
): Promise<PartIssuePage> {
  return request<PartIssuePage>(`/job-cards/${jobId}/part-issues`, { method: 'GET', query: params, signal })
}

export function issuePart(
  jobId: string,
  payload: PartIssueCreateRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<PartIssue> {
  return request<PartIssue>(`/job-cards/${jobId}/part-issues`, {
    method: 'POST',
    body: payload,
    headers: { 'Idempotency-Key': idempotencyKey },
    signal,
  })
}

export function reversePartIssue(
  jobId: string,
  partIssueId: string,
  payload: PartIssueReversalRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<PartIssueReversal> {
  return request<PartIssueReversal>(`/job-cards/${jobId}/part-issues/${partIssueId}/reversals`, {
    method: 'POST',
    body: payload,
    headers: { 'Idempotency-Key': idempotencyKey },
    signal,
  })
}

export interface ListPartReservationsParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  status?: 'ACTIVE' | 'FULFILLED' | 'RELEASED'
}

export function listPartReservations(
  jobId: string,
  params: ListPartReservationsParams = {},
  signal?: AbortSignal,
): Promise<PartReservationPage> {
  return request<PartReservationPage>(`/job-cards/${jobId}/part-reservations`, {
    method: 'GET',
    query: params,
    signal,
  })
}

export function reservePart(
  jobId: string,
  payload: PartReservationCreateRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<PartReservation> {
  return request<PartReservation>(`/job-cards/${jobId}/part-reservations`, {
    method: 'POST',
    body: payload,
    headers: { 'Idempotency-Key': idempotencyKey },
    signal,
  })
}

export function releasePartReservation(
  jobId: string,
  reservationId: string,
  signal?: AbortSignal,
): Promise<PartReservation> {
  return request<PartReservation>(`/job-cards/${jobId}/part-reservations/${reservationId}/release`, {
    method: 'POST',
    signal,
  })
}
