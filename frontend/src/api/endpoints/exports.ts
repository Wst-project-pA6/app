import { request } from '../client'
import type { QueryParams } from '../queryString'
import type { DownloadAuthorization, ExportJob, ExportJobCreateRequest, ExportJobPage } from '../types'

export interface ListExportJobsParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED'
  exportType?: ExportJob['exportType']
}

export function listExportJobs(params: ListExportJobsParams = {}, signal?: AbortSignal): Promise<ExportJobPage> {
  return request<ExportJobPage>('/exports', { method: 'GET', query: params, signal })
}

export function createExportJob(payload: ExportJobCreateRequest, signal?: AbortSignal): Promise<ExportJob> {
  return request<ExportJob>('/exports', { method: 'POST', body: payload, signal })
}

export function getExportJob(exportJobId: string, signal?: AbortSignal): Promise<ExportJob> {
  return request<ExportJob>(`/exports/${exportJobId}`, { method: 'GET', signal })
}

export function authorizeExportDownload(exportJobId: string, signal?: AbortSignal): Promise<DownloadAuthorization> {
  return request<DownloadAuthorization>(`/exports/${exportJobId}/download-authorizations`, {
    method: 'POST',
    signal,
  })
}
