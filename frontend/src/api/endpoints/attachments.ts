import { request } from '../client'
import type { QueryParams } from '../queryString'
import type { Attachment, AttachmentPage, DownloadAuthorization, JobAttachmentLinkRequest } from '../types'

export type AttachmentPurpose = 'JOB_PHOTO' | 'APPROVAL_EVIDENCE' | 'QUALITY_EVIDENCE' | 'TRAINING_EVIDENCE'

/** Multipart upload: the only endpoint that sends a FormData body instead of JSON. */
export function uploadAttachment(file: File, purpose: AttachmentPurpose, signal?: AbortSignal): Promise<Attachment> {
  const form = new FormData()
  form.set('file', file)
  form.set('purpose', purpose)
  return request<Attachment>('/attachments', { method: 'POST', body: form, signal })
}

export function getAttachment(attachmentId: string, signal?: AbortSignal): Promise<Attachment> {
  return request<Attachment>(`/attachments/${attachmentId}`, { method: 'GET', signal })
}

export function authorizeAttachmentDownload(
  attachmentId: string,
  signal?: AbortSignal,
): Promise<DownloadAuthorization> {
  return request<DownloadAuthorization>(`/attachments/${attachmentId}/download-authorizations`, {
    method: 'POST',
    signal,
  })
}

export interface ListJobAttachmentsParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
}

export function listJobAttachments(
  jobId: string,
  params: ListJobAttachmentsParams = {},
  signal?: AbortSignal,
): Promise<AttachmentPage> {
  return request<AttachmentPage>(`/job-cards/${jobId}/attachments`, { method: 'GET', query: params, signal })
}

export function linkJobAttachments(
  jobId: string,
  payload: JobAttachmentLinkRequest,
  signal?: AbortSignal,
): Promise<AttachmentPage> {
  return request<AttachmentPage>(`/job-cards/${jobId}/attachments`, { method: 'POST', body: payload, signal })
}
