import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTrainingMutation } from '@/api/hooks/training'
import { trainingOperations } from '@/api/endpoints/training'
import { hasAnyPermission } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { Button, Card } from '@/components'
import { TrainingAction, TrainingError } from './TrainingAction'
import { TrainingValue } from './TrainingFields'
import styles from '../Stage5.module.css'

export function ConflictPanel({ sessionId, version }: { sessionId: string; version?: number }) {
  const { user } = useAuth()
  if (!hasAnyPermission(user, trainingOperations.checkTrainingSessionConflicts.permissions)) return null
  return <ConflictReport key={`${sessionId}:${version ?? ''}`} sessionId={sessionId} />
}

function ConflictReport({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const check = useTrainingMutation('checkTrainingSessionConflicts', { sessionId })
  const [selected, setSelected] = useState<string[]>([])
  return (
    <Card>
      <div className={styles.page}>
        <Button
          type="button"
          disabled={!sessionId || check.isPending}
          onClick={() => {
            setSelected([])
            check.mutate({ body: undefined })
          }}
        >
          {t('training.actions.checkTrainingSessionConflicts')}
        </Button>
        {check.error && <TrainingError error={check.error} />}
        {check.isSuccess && (
          <>
            <TrainingValue value={check.data} schema={trainingOperations.checkTrainingSessionConflicts.response} />
            {hasAnyPermission(user, ['training.override-conflict']) && (
              <>
                {check.data.conflicts
                  .filter((conflict) => conflict.overridable && !conflict.overridden)
                  .map((conflict) => (
                    <label key={conflict.conflictKey}>
                      <input
                        type="checkbox"
                        checked={selected.includes(conflict.conflictKey)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, conflict.conflictKey]
                              : selected.filter((key) => key !== conflict.conflictKey),
                          )
                        }
                      />{' '}
                      {conflict.message}
                    </label>
                  ))}
                {selected.length > 0 && (
                  <TrainingAction
                    operation="createConflictOverrides"
                    params={{ sessionId }}
                    initial={{ conflictKeys: selected }}
                    lockedFields={['conflictKeys']}
                    onSuccess={() => {
                      setSelected([])
                      check.mutate({ body: undefined })
                    }}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
