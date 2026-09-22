import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as scopesApi from '../endpoints/organizationScopes'
import { queryKeys } from '../queryKeys'
import type { OrganizationScopeCreateRequest, OrganizationScopeUpdateRequest } from '../types'

export function useOrganizationScopesQuery(
  params: scopesApi.ListOrganizationScopesParams,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.organizationScopes.list(params),
    queryFn: ({ signal }) => scopesApi.listOrganizationScopes(params, signal),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  })
}

export function useCreateOrganizationScopeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: OrganizationScopeCreateRequest) => scopesApi.createOrganizationScope(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.organizationScopes.lists() })
    },
  })
}

export function useUpdateOrganizationScopeMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ scopeId, payload }: { scopeId: string; payload: OrganizationScopeUpdateRequest }) =>
      scopesApi.updateOrganizationScope(scopeId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.organizationScopes.lists() })
    },
  })
}
