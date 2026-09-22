import { useQuery } from '@tanstack/react-query'
import { listRoles } from '../endpoints/roles'
import { queryKeys } from '../queryKeys'

/** The fixed, unpaged role catalog. Rarely changes; a long staleTime avoids refetching it on every navigation. */
export function useRolesQuery() {
  return useQuery({
    queryKey: queryKeys.roles.list(),
    queryFn: ({ signal }) => listRoles(signal),
    staleTime: 5 * 60 * 1000,
  })
}
