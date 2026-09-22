import { request } from '../client'
import type { QueryParams } from '../queryString'
import type { Customer, CustomerCreateRequest, CustomerPage, CustomerUpdateRequest } from '../types'

export interface ListCustomersParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  q?: string
  status?: 'ACTIVE' | 'ARCHIVED'
  phone?: string
}

export function listCustomers(params: ListCustomersParams = {}, signal?: AbortSignal): Promise<CustomerPage> {
  return request<CustomerPage>('/customers', { method: 'GET', query: params, signal })
}

export function createCustomer(payload: CustomerCreateRequest, signal?: AbortSignal): Promise<Customer> {
  return request<Customer>('/customers', { method: 'POST', body: payload, signal })
}

export function getCustomer(customerId: string, signal?: AbortSignal): Promise<Customer> {
  return request<Customer>(`/customers/${customerId}`, { method: 'GET', signal })
}

export function updateCustomer(
  customerId: string,
  payload: CustomerUpdateRequest,
  signal?: AbortSignal,
): Promise<Customer> {
  return request<Customer>(`/customers/${customerId}`, { method: 'PATCH', body: payload, signal })
}
