import { request } from '../client'
import type { QueryParams } from '../queryString'
import type {
  JobApproval,
  JobApprovalCreateRequest,
  JobApprovalDecisionRequest,
  JobApprovalPage,
  QualityCheck,
  QualityCheckCreateRequest,
  QualityCheckPage,
} from '../types'

export interface ListJobApprovalsParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  status?: 'PENDING' | 'APPROVED' | 'REJECTED'
  scope?: 'INITIAL_WORK' | 'ADDITIONAL_WORK' | 'SUBLET'
}

export function listJobApprovals(
  jobId: string,
  params: ListJobApprovalsParams = {},
  signal?: AbortSignal,
): Promise<JobApprovalPage> {
  return request<JobApprovalPage>(`/job-cards/${jobId}/approvals`, { method: 'GET', query: params, signal })
}

export function createJobApproval(
  jobId: string,
  payload: JobApprovalCreateRequest,
  signal?: AbortSignal,
): Promise<JobApproval> {
  return request<JobApproval>(`/job-cards/${jobId}/approvals`, { method: 'POST', body: payload, signal })
}

export function decideJobApproval(
  jobId: string,
  approvalId: string,
  payload: JobApprovalDecisionRequest,
  signal?: AbortSignal,
): Promise<JobApproval> {
  return request<JobApproval>(`/job-cards/${jobId}/approvals/${approvalId}/decision`, {
    method: 'POST',
    body: payload,
    signal,
  })
}

export interface ListQualityChecksParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
}

export function listQualityChecks(
  jobId: string,
  params: ListQualityChecksParams = {},
  signal?: AbortSignal,
): Promise<QualityCheckPage> {
  return request<QualityCheckPage>(`/job-cards/${jobId}/quality-checks`, { method: 'GET', query: params, signal })
}

export function createQualityCheck(
  jobId: string,
  payload: QualityCheckCreateRequest,
  signal?: AbortSignal,
): Promise<QualityCheck> {
  return request<QualityCheck>(`/job-cards/${jobId}/quality-checks`, { method: 'POST', body: payload, signal })
}
