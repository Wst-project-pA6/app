import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/api/errors'
import { trainingOperations, type TrainingOperation, type TrainingRequest } from '@/api/endpoints/training'
import { useTrainingMutation } from '@/api/hooks/training'
import { hasAnyPermission } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import { Alert, Button, Card, QueryErrorPanel } from '@/components'
import { generateIdempotencyKey } from '@/lib/idempotencyKey'
import { TrainingFields, TrainingValue } from './TrainingFields'
import { initialValue, objectValue, validValue, type FieldValue } from './fieldValues'
import styles from '../Stage5.module.css'

export function TrainingError({
  error,
  onRetry,
  publicView = false,
}: {
  error: unknown
  onRetry?: () => void
  publicView?: boolean
}) {
  const { t } = useTranslation()
  if (error instanceof ApiError && [404, 501].includes(error.status))
    return (
      <Alert variant="warning">
        <p>{t(publicView && error.status === 404 ? 'training.verificationNotFound' : 'training.notAvailable')}</p>
        {onRetry && (
          <Button type="button" variant="secondary" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )}
      </Alert>
    )
  // Public failures never echo a backend error body that might contain internal fields.
  if (publicView)
    return (
      <Alert variant="danger">
        {t(error instanceof ApiError && error.status === 429 ? 'training.rateLimited' : 'training.verificationError')}
        {onRetry && (
          <Button type="button" variant="secondary" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        )}
      </Alert>
    )
  return <QueryErrorPanel error={error} onRetry={onRetry} />
}

export function TrainingAction({
  operation,
  params = {},
  initial,
  disabled,
  onSuccess,
  lockedFields,
}: {
  operation: TrainingOperation
  params?: Record<string, string>
  initial?: FieldValue
  disabled?: boolean
  onSuccess?: (value: unknown) => void
  lockedFields?: string[]
}) {
  const { user } = useAuth()
  if (!hasAnyPermission(user, trainingOperations[operation].permissions)) return null
  return (
    <ActionForm
      key={`${operation}:${JSON.stringify(params)}:${JSON.stringify(initial)}`}
      operation={operation}
      params={params}
      initial={initial}
      disabled={disabled}
      onSuccess={onSuccess}
      lockedFields={lockedFields}
    />
  )
}

function ActionForm({
  operation,
  params,
  initial,
  disabled,
  onSuccess,
  lockedFields = [],
}: {
  operation: TrainingOperation
  params: Record<string, string>
  initial?: FieldValue
  disabled?: boolean
  onSuccess?: (value: unknown) => void
  lockedFields?: string[]
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const meta = trainingOperations[operation]
  const [value, setValue] = useState<FieldValue>(() => (meta.body ? initialValue(meta.body, initial) : undefined))
  const [invalid, setInvalid] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey)
  const mutation = useTrainingMutation(operation, params)
  const body = objectValue(value)
  const editableSchema = meta.body
    ? {
        ...meta.body,
        properties: Object.fromEntries(
          Object.entries(meta.body.properties ?? {})
            .filter(
              ([key]) =>
                !lockedFields.includes(key) && !(key === 'version' && objectValue(initial).version !== undefined),
            )
            .map(([key, field]) => [
              key,
              operation === 'transitionTrainingSession' &&
              key === 'toStatus' &&
              !hasAnyPermission(user, ['training.publish'])
                ? { ...field, enum: field.enum?.filter((status) => status !== 'PUBLISHED') }
                : field,
            ]),
        ),
      }
    : undefined
  const dangerous =
    operation === 'revokeCertificate' ||
    operation === 'issueCertificate' ||
    operation === 'signOffAssessment' ||
    operation === 'transitionTrainingSession'
  return (
    <Card>
      <form
        className={styles.page}
        aria-label={t(`training.actions.${operation}`)}
        onSubmit={(event) => {
          event.preventDefault()
          const needsReason = body.toStatus === 'CANCELLED' || body.decision === 'RETURNED'
          const reason = body.decision === 'RETURNED' ? body.note : body.reason
          if (
            (meta.body && !validValue(meta.body, value)) ||
            (needsReason && (typeof reason !== 'string' || reason.trim().length < 3)) ||
            (dangerous && !confirmed) ||
            (body.toStatus === 'PUBLISHED' && !hasAnyPermission(user, ['training.publish']))
          ) {
            setInvalid(true)
            return
          }
          setInvalid(false)
          mutation.mutate(
            {
              body: value as TrainingRequest<typeof operation>,
              idempotencyKey: operation === 'issueCertificate' ? idempotencyKey : undefined,
            },
            {
              onSuccess: (data) => {
                setIdempotencyKey(generateIdempotencyKey())
                setConfirmed(false)
                onSuccess?.(data)
              },
            },
          )
        }}
      >
        <h2>{t(`training.actions.${operation}`)}</h2>
        {operation === 'createAssessment' && <p>{t('training.assessmentHint')}</p>}
        {operation === 'signOffAssessment' && <p>{t('training.signoffHint')}</p>}
        {operation === 'revokeCertificate' && <Alert variant="warning">{t('training.revokeWarning')}</Alert>}
        <fieldset disabled={disabled || mutation.isPending} className={styles.page}>
          {editableSchema && (
            <TrainingFields
              schema={editableSchema}
              value={value}
              onChange={(next) => {
                setValue(next)
                mutation.reset()
                setConfirmed(false)
                setIdempotencyKey(generateIdempotencyKey())
              }}
            />
          )}
          {dangerous && (
            <label>
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />{' '}
              {t('training.confirmAction')}
            </label>
          )}
          <Button type="submit" disabled={disabled || mutation.isPending}>
            {t(`training.actions.${operation}`)}
          </Button>
        </fieldset>
        {disabled && <p>{t('training.actionBlocked')}</p>}
        {invalid && <Alert variant="danger">{t('training.invalidForm')}</Alert>}
        {mutation.error && <TrainingError error={mutation.error} />}
        {mutation.isSuccess && (
          <>
            <Alert variant="success">{t('training.saved')}</Alert>
            <TrainingValue value={mutation.data} schema={meta.response} />
          </>
        )}
      </form>
    </Card>
  )
}
