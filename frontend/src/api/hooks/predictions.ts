import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as predictionsApi from '../endpoints/predictions'
import { queryKeys } from '../queryKeys'
import type { PredictionDecisionRequest, PredictionRunRequest, PredictionSettingsUpdateRequest } from '../types'

export function usePredictionsQuery(params: predictionsApi.ListPredictionsParams) {
  return useQuery({
    queryKey: queryKeys.predictions.list(params),
    queryFn: ({ signal }) => predictionsApi.listPredictions(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function usePredictionQuery(predictionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.predictions.detail(predictionId ?? ''),
    queryFn: ({ signal }) => predictionsApi.getPrediction(predictionId as string, signal),
    enabled: Boolean(predictionId),
  })
}

export function useDecidePredictionMutation(predictionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PredictionDecisionRequest) => predictionsApi.decidePrediction(predictionId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.predictions.detail(predictionId), updated)
      void queryClient.invalidateQueries({ queryKey: queryKeys.predictions.lists() })
    },
  })
}

/** Triggers a fresh rule-baseline run; never invoked automatically. */
export function useRunPredictionsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PredictionRunRequest) => predictionsApi.runPredictions(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.predictions.lists() })
    },
  })
}

export function usePredictionSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.predictionSettings.all,
    queryFn: ({ signal }) => predictionsApi.getPredictionSettings(signal),
  })
}

export function useReplacePredictionSettingsMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PredictionSettingsUpdateRequest) => predictionsApi.replacePredictionSettings(payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.predictionSettings.all, updated)
    },
  })
}
