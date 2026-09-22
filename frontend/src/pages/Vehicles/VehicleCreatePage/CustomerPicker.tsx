import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCustomersQuery } from '@/api/hooks/customers'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import { SearchInput, TextInput } from '@/components'
import styles from './VehicleCreatePage.module.css'

export interface CustomerPickerProps {
  value: string
  onChange: (customerId: string) => void
}

/**
 * Customer lookup for registering a vehicle. Uses the customers search
 * endpoint when the caller holds `customers.read`; otherwise falls back to
 * a plain customer-ID field so a user who can write vehicles but not read
 * customers can still register one, without inventing a new endpoint.
 */
export function CustomerPicker({ value, onChange }: CustomerPickerProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const canRead = hasAnyPermission(user, ['customers.read'])
  const [search, setSearch] = useState('')

  const customersQuery = useCustomersQuery({ q: search || undefined, pageSize: 10 })

  if (!canRead) {
    return (
      <div>
        <TextInput
          id="vehicle-customer-id"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="dir-ltr"
          required
        />
        <p className={styles.hint}>{t('vehicles.create.customerIdHint')}</p>
      </div>
    )
  }

  const selected = customersQuery.data?.items.find((customer) => customer.id === value)

  return (
    <div>
      <SearchInput value={search} onChange={setSearch} placeholder={t('vehicles.create.customerSearchPlaceholder')} />
      {selected ? <p className={styles.selectedCustomer}>{selected.displayName}</p> : null}
      {search && customersQuery.data ? (
        <ul className={styles.customerResults}>
          {customersQuery.data.items.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                className={styles.customerResultButton}
                onClick={() => onChange(customer.id)}
                aria-pressed={customer.id === value}
              >
                {customer.displayName} <span className="dir-ltr">{customer.phone}</span>
              </button>
            </li>
          ))}
          {customersQuery.data.items.length === 0 ? <li className={styles.hint}>{t('common.noResults')}</li> : null}
        </ul>
      ) : null}
    </div>
  )
}
