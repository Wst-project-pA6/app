import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as usersApi from '../endpoints/users'
import { queryKeys } from '../queryKeys'
import type { RoleAssignmentRequest, ScopeAssignmentRequest, UserCreateRequest, UserUpdateRequest } from '../types'

export function useUsersQuery(params: usersApi.ListUsersParams) {
  return useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: ({ signal }) => usersApi.listUsers(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useUserQuery(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.users.detail(userId ?? ''),
    queryFn: ({ signal }) => usersApi.getUser(userId as string, signal),
    enabled: Boolean(userId),
  })
}

export function useCreateUserMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UserCreateRequest) => usersApi.createUser(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() })
    },
  })
}

export function useUpdateUserMutation(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UserUpdateRequest) => usersApi.updateUser(userId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.users.detail(userId), updated)
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() })
    },
  })
}

export function useReplaceUserRolesMutation(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: RoleAssignmentRequest) => usersApi.replaceUserRoles(userId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.users.detail(userId), updated)
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() })
    },
  })
}

export function useReplaceUserOrganizationScopesMutation(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ScopeAssignmentRequest) => usersApi.replaceUserOrganizationScopes(userId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.users.detail(userId), updated)
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() })
    },
  })
}
