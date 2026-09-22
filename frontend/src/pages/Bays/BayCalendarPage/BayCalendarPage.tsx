import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useBayCalendarQuery } from '@/api/hooks/bays'
import { Alert, Button, EmptyState, ListStateBoundary, PageHeader, TextInput } from '@/components'
import { formatDateTime } from '@/lib/format'
import { useSearchParamState } from '@/hooks/useSearchParamState'
import type { CalendarReference } from '@/api/types'
import { validateCalendarWindow } from './validateWindow'
import styles from './BayCalendarPage.module.css'

function todayDateString(offsetDays = 0): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

export function BayCalendarPage() {
  const { bayId } = useParams<{ bayId: string }>()
  const { t } = useTranslation()

  const [fromDate, setFromDate] = useSearchParamState('from', todayDateString())
  const [toDate, setToDate] = useSearchParamState('to', todayDateString(7))
  const [draftFrom, setDraftFrom] = useState(fromDate)
  const [draftTo, setDraftTo] = useState(toDate)

  const validation = useMemo(() => validateCalendarWindow(fromDate, toDate), [fromDate, toDate])

  const calendarQuery = useBayCalendarQuery(
    bayId,
    validation.valid ? validation.fromIso! : '',
    validation.valid ? validation.toIso! : '',
    validation.valid,
  )

  function applyWindow() {
    setFromDate(draftFrom)
    setToDate(draftTo)
  }

  const groupedEntries = useMemo(() => {
    const entries = calendarQuery.data?.entries ?? []
    const groups = new Map<string, CalendarReference[]>()
    for (const entry of entries) {
      const dateKey = entry.startsAt.slice(0, 10)
      const group = groups.get(dateKey) ?? []
      group.push(entry)
      groups.set(dateKey, group)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [calendarQuery.data])

  return (
    <div>
      <PageHeader title={t('bays.calendar.title')} actions={<Link to="/bays">{t('bays.calendar.backToList')}</Link>} />

      <form
        className={styles.controls}
        onSubmit={(event) => {
          event.preventDefault()
          applyWindow()
        }}
      >
        <label className={styles.field}>
          <span>{t('bays.calendar.fromLabel')}</span>
          <TextInput type="date" dirStable value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} />
        </label>
        <label className={styles.field}>
          <span>{t('bays.calendar.toLabel')}</span>
          <TextInput type="date" dirStable value={draftTo} onChange={(event) => setDraftTo(event.target.value)} />
        </label>
        <Button type="submit">{t('bays.calendar.apply')}</Button>
      </form>

      {!validation.valid ? <Alert variant="warning">{t('bays.calendar.windowError')}</Alert> : null}

      <p className={styles.notice}>{t('bays.calendar.noCustomerNotice')}</p>

      {validation.valid ? (
        <ListStateBoundary
          isLoading={calendarQuery.isLoading}
          isError={calendarQuery.isError}
          error={calendarQuery.error}
          onRetry={() => void calendarQuery.refetch()}
          isEmpty={groupedEntries.length === 0}
          emptyTitle={t('bays.calendar.empty.title')}
          emptyDescription={t('bays.calendar.empty.description')}
        >
          <div>
            {groupedEntries.map(([dateKey, entries]) => (
              <section key={dateKey} className={styles.dayGroup}>
                <h2 className={styles.dayHeading}>{formatDateTime(`${dateKey}T00:00:00.000Z`)}</h2>
                <ul className={styles.entryList}>
                  {entries.map((entry) => (
                    <li key={`${entry.kind}-${entry.referenceId}`} className={styles.entry}>
                      <span className={styles.entryKind}>
                        {entry.kind === 'JOB' ? t('bays.calendar.jobEntry') : t('bays.calendar.trainingEntry')}
                      </span>
                      <span className="dir-ltr">{entry.referenceLabel}</span>
                      <span className={styles.entryTime}>
                        {formatDateTime(entry.startsAt)} – {formatDateTime(entry.endsAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </ListStateBoundary>
      ) : (
        <EmptyState title={t('bays.calendar.empty.title')} description={t('bays.calendar.windowError')} />
      )}
    </div>
  )
}
