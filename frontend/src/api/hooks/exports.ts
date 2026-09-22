import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as exportsApi from '../endpoints/exports'
import { queryKeys } from '../queryKeys'
import type { ExportJobCreateRequest } from '../types'

export function useExportJobsQuery(params: exportsApi.ListExportJobsParams) {
  return useQuery({
    queryKey: queryKeys.exports.list(params),
    queryFn: ({ signal }) => exportsApi.listExportJobs(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useExportJobQuery(exportJobId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.exports.detail(exportJobId ?? ''),
    queryFn: ({ signal }) => exportsApi.getExportJob(exportJobId as string, signal),
    enabled: Boolean(exportJobId) && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'PENDING' || status === 'PROCESSING' ? 2500 : false
    },
  })
}

export function useCreateExportJobMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ExportJobCreateRequest) => exportsApi.createExportJob(payload),
    onSuccess: (created) => {
      queryClient.setQueryData(queryKeys.exports.detail(created.id), created)
      void queryClient.invalidateQueries({ queryKey: queryKeys.exports.lists() })
    },
  })
}

export function useAuthorizeExportDownloadMutation() {
  return useMutation({ mutationFn: (exportJobId: string) => exportsApi.authorizeExportDownload(exportJobId) })
}
