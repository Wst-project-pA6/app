import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as attachmentsApi from '../endpoints/attachments'
import { queryKeys } from '../queryKeys'
import type { JobAttachmentLinkRequest } from '../types'

export function useJobAttachmentsQuery(jobId: string | undefined, params: attachmentsApi.ListJobAttachmentsParams) {
  return useQuery({
    queryKey: queryKeys.jobs.attachments(jobId ?? '', params),
    queryFn: ({ signal }) => attachmentsApi.listJobAttachments(jobId as string, params, signal),
    enabled: Boolean(jobId),
    placeholderData: keepPreviousData,
  })
}

export function useUploadAttachmentMutation() {
  return useMutation({
    mutationFn: ({ file, purpose }: { file: File; purpose: attachmentsApi.AttachmentPurpose }) =>
      attachmentsApi.uploadAttachment(file, purpose),
  })
}

export function useLinkJobAttachmentsMutation(jobId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: JobAttachmentLinkRequest) => attachmentsApi.linkJobAttachments(jobId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.jobs.detail(jobId), 'attachments'] })
    },
  })
}

export function useAuthorizeAttachmentDownloadMutation() {
  return useMutation({
    mutationFn: (attachmentId: string) => attachmentsApi.authorizeAttachmentDownload(attachmentId),
  })
}
