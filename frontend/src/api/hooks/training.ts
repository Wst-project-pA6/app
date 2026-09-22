import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { callTraining, type TrainingOperation, type TrainingRequest } from '../endpoints/training'
import type { QueryParams } from '../queryString'
import { queryKeys } from '../queryKeys'

export function useTrainingQuery<K extends TrainingOperation>(
  operation: K,
  params: Record<string, string>,
  query: QueryParams,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.training.operation(operation, params, query),
    queryFn: ({ signal }) => callTraining(operation, params, query, undefined, signal),
    enabled,
    retry: false,
  })
}

export function useTrainingMutation<K extends TrainingOperation>(operation: K, params: Record<string, string>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: TrainingRequest<K>; idempotencyKey?: string }) =>
      callTraining(operation, params, undefined, body, undefined, idempotencyKey),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.training.all })
    },
  })
}
