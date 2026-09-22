import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as customersApi from '../endpoints/customers'
import { queryKeys } from '../queryKeys'
import type { CustomerCreateRequest, CustomerUpdateRequest } from '../types'

export function useCustomersQuery(params: customersApi.ListCustomersParams) {
  return useQuery({
    queryKey: queryKeys.customers.list(params),
    queryFn: ({ signal }) => customersApi.listCustomers(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useCustomerQuery(customerId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.customers.detail(customerId ?? ''),
    queryFn: ({ signal }) => customersApi.getCustomer(customerId as string, signal),
    enabled: Boolean(customerId),
  })
}

export function useCreateCustomerMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CustomerCreateRequest) => customersApi.createCustomer(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.lists() })
    },
  })
}

export function useUpdateCustomerMutation(customerId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CustomerUpdateRequest) => customersApi.updateCustomer(customerId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.customers.detail(customerId), updated)
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.lists() })
    },
  })
}
