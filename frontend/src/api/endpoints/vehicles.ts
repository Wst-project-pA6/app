import { request } from '../client'
import type { QueryParams } from '../queryString'
import type {
  ServiceHistoryPage,
  ServiceReminder,
  ServiceReminderCreateRequest,
  ServiceReminderPage,
  ServiceReminderUpdateRequest,
  Vehicle,
  VehicleCreateRequest,
  VehiclePage,
  VehicleUpdateRequest,
} from '../types'

export interface ListVehiclesParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  q?: string
  customerId?: string
  plate?: string
  vin?: string
  make?: string
  model?: string
  status?: 'ACTIVE' | 'ARCHIVED'
}

export function listVehicles(params: ListVehiclesParams = {}, signal?: AbortSignal): Promise<VehiclePage> {
  return request<VehiclePage>('/vehicles', { method: 'GET', query: params, signal })
}

export function createVehicle(payload: VehicleCreateRequest, signal?: AbortSignal): Promise<Vehicle> {
  return request<Vehicle>('/vehicles', { method: 'POST', body: payload, signal })
}

export function getVehicle(vehicleId: string, signal?: AbortSignal): Promise<Vehicle> {
  return request<Vehicle>(`/vehicles/${vehicleId}`, { method: 'GET', signal })
}

export function updateVehicle(
  vehicleId: string,
  payload: VehicleUpdateRequest,
  signal?: AbortSignal,
): Promise<Vehicle> {
  return request<Vehicle>(`/vehicles/${vehicleId}`, { method: 'PATCH', body: payload, signal })
}

export interface ListServiceHistoryParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
}

export function listVehicleServiceHistory(
  vehicleId: string,
  params: ListServiceHistoryParams = {},
  signal?: AbortSignal,
): Promise<ServiceHistoryPage> {
  return request<ServiceHistoryPage>(`/vehicles/${vehicleId}/service-history`, {
    method: 'GET',
    query: params,
    signal,
  })
}

export interface ListServiceRemindersParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  status?: 'OPEN' | 'DONE' | 'CANCELLED'
}

export function listServiceReminders(
  vehicleId: string,
  params: ListServiceRemindersParams = {},
  signal?: AbortSignal,
): Promise<ServiceReminderPage> {
  return request<ServiceReminderPage>(`/vehicles/${vehicleId}/reminders`, { method: 'GET', query: params, signal })
}

export function createServiceReminder(
  vehicleId: string,
  payload: ServiceReminderCreateRequest,
  signal?: AbortSignal,
): Promise<ServiceReminder> {
  return request<ServiceReminder>(`/vehicles/${vehicleId}/reminders`, { method: 'POST', body: payload, signal })
}

export function updateServiceReminder(
  reminderId: string,
  payload: ServiceReminderUpdateRequest,
  signal?: AbortSignal,
): Promise<ServiceReminder> {
  return request<ServiceReminder>(`/service-reminders/${reminderId}`, { method: 'PATCH', body: payload, signal })
}
