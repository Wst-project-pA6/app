import { request } from '../client'
import type { FinanceSettings } from '../types'

export function getFinanceSettings(signal?: AbortSignal): Promise<FinanceSettings> {
  return request<FinanceSettings>('/config/finance-settings', { method: 'GET', signal })
}
