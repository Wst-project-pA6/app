import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as vehiclesApi from '../endpoints/vehicles'
import { queryKeys } from '../queryKeys'
import type {
  ServiceReminderCreateRequest,
  ServiceReminderUpdateRequest,
  VehicleCreateRequest,
  VehicleUpdateRequest,
} from '../types'

export function useVehiclesQuery(params: vehiclesApi.ListVehiclesParams) {
  return useQuery({
    queryKey: queryKeys.vehicles.list(params),
    queryFn: ({ signal }) => vehiclesApi.listVehicles(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useVehicleQuery(vehicleId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.vehicles.detail(vehicleId ?? ''),
    queryFn: ({ signal }) => vehiclesApi.getVehicle(vehicleId as string, signal),
    enabled: Boolean(vehicleId),
  })
}

export function useCreateVehicleMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: VehicleCreateRequest) => vehiclesApi.createVehicle(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.lists() })
    },
  })
}

export function useUpdateVehicleMutation(vehicleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: VehicleUpdateRequest) => vehiclesApi.updateVehicle(vehicleId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.vehicles.detail(vehicleId), updated)
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.lists() })
    },
  })
}

export function useVehicleServiceHistoryQuery(
  vehicleId: string | undefined,
  params: vehiclesApi.ListServiceHistoryParams,
) {
  return useQuery({
    queryKey: queryKeys.vehicles.serviceHistory(vehicleId ?? '', params),
    queryFn: ({ signal }) => vehiclesApi.listVehicleServiceHistory(vehicleId as string, params, signal),
    enabled: Boolean(vehicleId),
    placeholderData: keepPreviousData,
  })
}

export function useVehicleRemindersQuery(
  vehicleId: string | undefined,
  params: vehiclesApi.ListServiceRemindersParams,
) {
  return useQuery({
    queryKey: queryKeys.vehicles.reminders(vehicleId ?? '', params),
    queryFn: ({ signal }) => vehiclesApi.listServiceReminders(vehicleId as string, params, signal),
    enabled: Boolean(vehicleId),
    placeholderData: keepPreviousData,
  })
}

export function useCreateServiceReminderMutation(vehicleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ServiceReminderCreateRequest) => vehiclesApi.createServiceReminder(vehicleId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.detail(vehicleId) })
    },
  })
}

export function useUpdateServiceReminderMutation(vehicleId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ reminderId, payload }: { reminderId: string; payload: ServiceReminderUpdateRequest }) =>
      vehiclesApi.updateServiceReminder(reminderId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.detail(vehicleId) })
    },
  })
}
