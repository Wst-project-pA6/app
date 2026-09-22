import { request } from '../client'
import type { QueryParams } from '../queryString'
import type {
  InvoiceSummary,
  Invoice,
  JobAssignmentRequest,
  JobCard,
  JobCardCreateRequest,
  JobCardPage,
  JobCardUpdateRequest,
  JobStageEventPage,
  JobTransitionRequest,
  UserRefPage,
  WorkItem,
  WorkItemCreateRequest,
  WorkItemPage,
  WorkItemUpdateRequest,
} from '../types'

export interface ListTechniciansParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  q?: string
}

export function listTechnicians(params: ListTechniciansParams = {}, signal?: AbortSignal): Promise<UserRefPage> {
  return request<UserRefPage>('/technicians', { method: 'GET', query: params, signal })
}

export interface ListJobCardsParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  q?: string
  from?: string
  to?: string
  stage?: string
  priority?: string
  jobNumber?: string
  technicianId?: string
  bayId?: string
  vehicleId?: string
  customerId?: string
}

export function listJobCards(params: ListJobCardsParams = {}, signal?: AbortSignal): Promise<JobCardPage> {
  return request<JobCardPage>('/job-cards', { method: 'GET', query: params, signal })
}

export function createJobCard(payload: JobCardCreateRequest, signal?: AbortSignal): Promise<JobCard> {
  return request<JobCard>('/job-cards', { method: 'POST', body: payload, signal })
}

export function getJobCard(jobId: string, signal?: AbortSignal): Promise<JobCard> {
  return request<JobCard>(`/job-cards/${jobId}`, { method: 'GET', signal })
}

export function updateJobCard(jobId: string, payload: JobCardUpdateRequest, signal?: AbortSignal): Promise<JobCard> {
  return request<JobCard>(`/job-cards/${jobId}`, { method: 'PATCH', body: payload, signal })
}

export function assignJobCard(jobId: string, payload: JobAssignmentRequest, signal?: AbortSignal): Promise<JobCard> {
  return request<JobCard>(`/job-cards/${jobId}/assignment`, { method: 'PUT', body: payload, signal })
}

export function transitionJobCard(
  jobId: string,
  payload: JobTransitionRequest,
  signal?: AbortSignal,
): Promise<JobCard> {
  return request<JobCard>(`/job-cards/${jobId}/transitions`, { method: 'POST', body: payload, signal })
}

export interface ListStageHistoryParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
}

export function listJobStageHistory(
  jobId: string,
  params: ListStageHistoryParams = {},
  signal?: AbortSignal,
): Promise<JobStageEventPage> {
  return request<JobStageEventPage>(`/job-cards/${jobId}/stage-history`, { method: 'GET', query: params, signal })
}

export interface ListWorkItemsParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  status?: 'PENDING' | 'DONE' | 'CANCELLED'
}

export function listWorkItems(
  jobId: string,
  params: ListWorkItemsParams = {},
  signal?: AbortSignal,
): Promise<WorkItemPage> {
  return request<WorkItemPage>(`/job-cards/${jobId}/work-items`, { method: 'GET', query: params, signal })
}

export function createWorkItem(jobId: string, payload: WorkItemCreateRequest, signal?: AbortSignal): Promise<WorkItem> {
  return request<WorkItem>(`/job-cards/${jobId}/work-items`, { method: 'POST', body: payload, signal })
}

export function updateWorkItem(
  jobId: string,
  workItemId: string,
  payload: WorkItemUpdateRequest,
  signal?: AbortSignal,
): Promise<WorkItem> {
  return request<WorkItem>(`/job-cards/${jobId}/work-items/${workItemId}`, {
    method: 'PATCH',
    body: payload,
    signal,
  })
}

export function getJobInvoiceSummary(jobId: string, signal?: AbortSignal): Promise<InvoiceSummary> {
  return request<InvoiceSummary>(`/job-cards/${jobId}/invoice-summary`, { method: 'GET', signal })
}

export function regenerateJobInvoice(jobId: string, signal?: AbortSignal): Promise<Invoice> {
  return request<Invoice>(`/job-cards/${jobId}/invoices`, { method: 'POST', signal })
}
