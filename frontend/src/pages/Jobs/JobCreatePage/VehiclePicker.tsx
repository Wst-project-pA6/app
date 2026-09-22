import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useVehiclesQuery } from '@/api/hooks/vehicles'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import { SearchInput, TextInput } from '@/components'
import styles from './JobCreatePage.module.css'

export function VehiclePicker({ value, onChange }: { value: string; onChange: (vehicleId: string) => void }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const canRead = hasAnyPermission(user, ['vehicles.read'])
  const [search, setSearch] = useState('')

  const vehiclesQuery = useVehiclesQuery({ q: search || undefined, pageSize: 10 })

  if (!canRead) {
    return (
      <div>
        <TextInput
          id="job-vehicle-id"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="dir-ltr"
          required
        />
        <p className={styles.hint}>{t('jobs.create.vehicleIdHint')}</p>
      </div>
    )
  }

  const selected = vehiclesQuery.data?.items.find((vehicle) => vehicle.id === value)

  return (
    <div>
      <SearchInput value={search} onChange={setSearch} placeholder={t('jobs.create.vehicleSearchPlaceholder')} />
      {selected ? (
        <p className={styles.selected}>
          <span className="dir-ltr">{selected.plate}</span> — {selected.make} {selected.model}
        </p>
      ) : null}
      {search && vehiclesQuery.data ? (
        <ul className={styles.results}>
          {vehiclesQuery.data.items.map((vehicle) => (
            <li key={vehicle.id}>
              <button
                type="button"
                className={styles.resultButton}
                onClick={() => onChange(vehicle.id)}
                aria-pressed={vehicle.id === value}
              >
                <span className="dir-ltr">{vehicle.plate}</span> — {vehicle.make} {vehicle.model}
              </button>
            </li>
          ))}
          {vehiclesQuery.data.items.length === 0 ? <li className={styles.hint}>{t('common.noResults')}</li> : null}
        </ul>
      ) : null}
    </div>
  )
}
