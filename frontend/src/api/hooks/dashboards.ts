import { useQuery } from '@tanstack/react-query'
import * as dashboardsApi from '../endpoints/dashboards'
import { queryKeys } from '../queryKeys'

export function useDashboardQuery(
  dashboard: 'workshop' | 'inventory-finance' | 'training' | 'ai-data',
  params: dashboardsApi.DashboardFilters,
  enabled = true,
) {
  const queryFns = {
    workshop: dashboardsApi.getWorkshopDashboard,
    'inventory-finance': dashboardsApi.getInventoryFinanceDashboard,
    training: dashboardsApi.getTrainingDashboard,
    'ai-data': dashboardsApi.getAiDataDashboard,
  } as const
  return useQuery({
    queryKey: queryKeys.dashboards.detail(dashboard, params),
    queryFn: ({ signal }) => queryFns[dashboard](params, signal),
    enabled,
  })
}
