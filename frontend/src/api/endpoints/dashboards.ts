import { request } from '../client'
import type { QueryParams } from '../queryString'
import type { DashboardResponse, ReportFilters } from '../types'

export type DashboardFilters = ReportFilters & QueryParams

export function getWorkshopDashboard(params: DashboardFilters = {}, signal?: AbortSignal): Promise<DashboardResponse> {
  return request<DashboardResponse>('/dashboards/workshop', { method: 'GET', query: params, signal })
}

export function getInventoryFinanceDashboard(
  params: DashboardFilters = {},
  signal?: AbortSignal,
): Promise<DashboardResponse> {
  return request<DashboardResponse>('/dashboards/inventory-finance', { method: 'GET', query: params, signal })
}

export function getTrainingDashboard(params: DashboardFilters = {}, signal?: AbortSignal): Promise<DashboardResponse> {
  return request<DashboardResponse>('/dashboards/training', { method: 'GET', query: params, signal })
}

export function getAiDataDashboard(params: DashboardFilters = {}, signal?: AbortSignal): Promise<DashboardResponse> {
  return request<DashboardResponse>('/dashboards/ai-data', { method: 'GET', query: params, signal })
}
