import { useQuery } from '@tanstack/react-query'
import { getFinanceSettings } from '../endpoints/config'

/** System currency and tax settings. Long staleTime: this rarely changes and many create forms need currencyCode to build Money fields. */
export function useFinanceSettingsQuery() {
  return useQuery({
    queryKey: ['financeSettings'] as const,
    queryFn: ({ signal }) => getFinanceSettings(signal),
    staleTime: 5 * 60 * 1000,
  })
}
