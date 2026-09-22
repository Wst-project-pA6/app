import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { usePredictionsQuery, useDecidePredictionMutation, useRunPredictionsMutation } from '@/api/hooks/predictions'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  Alert,
  Button,
  Card,
  FilterBar,
  FormField,
  ListStateBoundary,
  Modal,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  Table,
  TextInput,
  useToast,
  type TableColumn,
} from '@/components'
import { formatDateTime } from '@/lib/format'
import { useSearchParamPage, useSearchParamState } from '@/hooks/useSearchParamState'
import type { Prediction, PredictionStatus, PredictionType } from '@/api/types'
import { PredictionSourceTag } from './PredictionSourceTag'
import { PredictionsSectionNav } from './PredictionsSectionNav'
import styles from '../Stage5.module.css'

const PAGE_SIZE = 20
const STATUS_OPTIONS: ReadonlyArray<PredictionStatus> = ['ACTIVE', 'ACCEPTED', 'OVERRIDDEN', 'DISMISSED', 'SUPERSEDED']
const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const

const decisionSchema = z
  .object({
    decision: z.enum(['ACCEPTED', 'OVERRIDDEN', 'DISMISSED']),
    overrideReason: z.string().max(500).optional(),
    overrideQuantity: z.number().int().min(0).optional(),
    note: z.string().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'OVERRIDDEN' && (!value.overrideReason || value.overrideReason.trim().length < 3)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['overrideReason'], message: 'required' })
    }
  })
type DecisionFormValues = z.infer<typeof decisionSchema>

function isUnavailableError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 501 || error.code === 'NETWORK_ERROR')
}

export function PredictionListPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canDecideReorder = hasAnyPermission(user, ['predictions.reorder.decide'])
  const canDecideRisk = hasAnyPermission(user, ['predictions.risk.decide'])

  const [type, setType] = useSearchParamState('type')
  const [status, setStatus] = useSearchParamState('status')
  const [riskLevel, setRiskLevel] = useSearchParamState('riskLevel')
  const [storeId, setStoreId] = useSearchParamState('storeId')
  const [partId, setPartId] = useSearchParamState('partId')
  const [studentId, setStudentId] = useSearchParamState('studentId')
  const [courseId, setCourseId] = useSearchParamState('courseId')
  const [page, setPage] = useSearchParamPage()

  const query = usePredictionsQuery({
    page,
    pageSize: PAGE_SIZE,
    sort: '-generatedAt',
    type: (type || undefined) as PredictionType | undefined,
    status: (status || undefined) as PredictionStatus | undefined,
    riskLevel: (riskLevel || undefined) as 'LOW' | 'MEDIUM' | 'HIGH' | undefined,
    storeId: storeId || undefined,
    partId: partId || undefined,
    studentId: studentId || undefined,
    courseId: courseId || undefined,
  })

  const runMutation = useRunPredictionsMutation()
  const [deciding, setDeciding] = useState<Prediction | null>(null)
  const decideMutation = useDecidePredictionMutation(deciding?.id ?? '')

  const decisionForm = useForm<DecisionFormValues>({
    resolver: zodResolver(decisionSchema),
    defaultValues: { decision: 'ACCEPTED' },
  })

  async function runNow(runType: PredictionType) {
    try {
      const run = await runMutation.mutateAsync({ type: runType })
      showToast(t('predictions.list.runSuccess', { count: run.generatedCount }), 'success')
      if (run.mlService === 'UNAVAILABLE_FALLBACK_USED') {
        showToast(t('predictions.list.runFallbackNotice'), 'info')
      }
    } catch {
      showToast(runMutation.error instanceof ApiError ? runMutation.error.message : t('errors.unknownError'), 'error')
    }
  }

  function openDecide(row: Prediction) {
    setDeciding(row)
    decisionForm.reset({ decision: 'ACCEPTED', overrideReason: '', note: '', overrideQuantity: undefined })
  }

  async function onDecide(values: DecisionFormValues) {
    if (!deciding) return
    try {
      await decideMutation.mutateAsync({
        decision: values.decision,
        overrideReason: values.decision === 'OVERRIDDEN' ? values.overrideReason : undefined,
        overrideQuantity: Number.isFinite(values.overrideQuantity) ? values.overrideQuantity : undefined,
        note: values.note || undefined,
      })
      showToast(t('predictions.decide.success'), 'success')
      setDeciding(null)
    } catch {
      // surfaced below via decideMutation.isError
    }
  }

  const decisionValue = decisionForm.watch('decision')

  const columns: ReadonlyArray<TableColumn<Prediction>> = [
    {
      key: 'generatedAt',
      header: t('predictions.list.columns.generatedAt'),
      render: (row) => formatDateTime(row.generatedAt),
    },
    {
      key: 'type',
      header: t('predictions.list.columns.type'),
      render: (row) => t(`predictions.list.typeOptions.${row.type}`),
    },
    {
      key: 'summary',
      header: t('predictions.list.columns.summary'),
      render: (row) => <Link to={`/predictions/${row.id}`}>{row.explanation.summary}</Link>,
    },
    {
      key: 'detail',
      header: t('predictions.list.columns.detail'),
      render: (row) => <PredictionDetailSummary row={row} />,
    },
    {
      key: 'source',
      header: t('predictions.list.columns.source'),
      render: (row) => <PredictionSourceTag source={row.source} />,
    },
    {
      key: 'status',
      header: t('common.status'),
      render: (row) => (
        <StatusBadge tone={statusTone(row.status)}>{t(`predictions.list.statusOptions.${row.status}`)}</StatusBadge>
      ),
    },
    {
      key: 'decision',
      header: t('predictions.list.columns.decision'),
      render: (row) =>
        row.decision ? (
          <span>
            {t(`predictions.decide.decisionOptions.${row.decision.decision}`)} ·{' '}
            {formatDateTime(row.decision.decidedAt)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (row) => {
        const canDecideThis =
          row.status === 'ACTIVE' &&
          ((row.type === 'REORDER_SUGGESTION' && canDecideReorder) || (row.type === 'TRAINING_RISK' && canDecideRisk))
        return (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Link to={`/predictions/${row.id}`}>{t('common.view')}</Link>
            {canDecideThis ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => openDecide(row)}>
                {t('predictions.list.decideAction')}
              </Button>
            ) : null}
          </div>
        )
      },
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader title={t('predictions.title')} description={t('predictions.description')} />
      <PredictionsSectionNav />

      <Alert variant="info" title={t('predictions.advisoryNotice')}>
        <p>{t('predictions.advisoryReminder')}</p>
      </Alert>

      {canDecideReorder || canDecideRisk ? (
        <Card title={t('predictions.list.runNow')}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {canDecideReorder ? (
              <Button
                type="button"
                variant="secondary"
                isLoading={runMutation.isPending && runMutation.variables?.type === 'REORDER_SUGGESTION'}
                onClick={() => void runNow('REORDER_SUGGESTION')}
              >
                {t('predictions.list.runReorder')}
              </Button>
            ) : null}
            {canDecideRisk ? (
              <Button
                type="button"
                variant="secondary"
                isLoading={runMutation.isPending && runMutation.variables?.type === 'TRAINING_RISK'}
                onClick={() => void runNow('TRAINING_RISK')}
              >
                {t('predictions.list.runRisk')}
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      <FilterBar>
        <Select
          aria-label={t('predictions.list.typeFilter')}
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">{t('common.allTypes')}</option>
          <option value="REORDER_SUGGESTION">{t('predictions.list.typeOptions.REORDER_SUGGESTION')}</option>
          <option value="TRAINING_RISK">{t('predictions.list.typeOptions.TRAINING_RISK')}</option>
        </Select>
        <Select
          aria-label={t('predictions.list.statusFilter')}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">{t('common.allStatuses')}</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(`predictions.list.statusOptions.${option}`)}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t('predictions.list.riskLevelFilter')}
          value={riskLevel}
          onChange={(event) => setRiskLevel(event.target.value)}
        >
          <option value="">{t('predictions.list.riskLevelFilter')}</option>
          {RISK_LEVELS.map((option) => (
            <option key={option} value={option}>
              {t(`predictions.list.riskLevelOptions.${option}`)}
            </option>
          ))}
        </Select>
        <TextInput
          aria-label={t('predictions.list.storeIdFilter')}
          placeholder={t('predictions.list.storeIdFilter')}
          value={storeId}
          onChange={(event) => setStoreId(event.target.value)}
          className="dir-ltr"
        />
        <TextInput
          aria-label={t('predictions.list.partIdFilter')}
          placeholder={t('predictions.list.partIdFilter')}
          value={partId}
          onChange={(event) => setPartId(event.target.value)}
          className="dir-ltr"
        />
        <TextInput
          aria-label={t('predictions.list.studentIdFilter')}
          placeholder={t('predictions.list.studentIdFilter')}
          value={studentId}
          onChange={(event) => setStudentId(event.target.value)}
          className="dir-ltr"
        />
        <TextInput
          aria-label={t('predictions.list.courseIdFilter')}
          placeholder={t('predictions.list.courseIdFilter')}
          value={courseId}
          onChange={(event) => setCourseId(event.target.value)}
          className="dir-ltr"
        />
      </FilterBar>

      {query.isError && isUnavailableError(query.error) ? (
        <Alert variant="warning" title={t('predictions.unavailableTitle')}>
          <p>{t('predictions.unavailableMessage')}</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </Alert>
      ) : (
        <ListStateBoundary
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={(query.data?.items.length ?? 0) === 0}
          emptyTitle={t('predictions.list.empty.title')}
          emptyDescription={t('predictions.list.empty.description')}
        >
          <Table columns={columns} rows={query.data?.items ?? []} getRowKey={(row) => row.id} />
          {query.data ? (
            <Pagination
              page={query.data.page.page}
              pageSize={query.data.page.pageSize}
              totalItems={query.data.page.totalItems}
              totalPages={query.data.page.totalPages}
              onPageChange={setPage}
            />
          ) : null}
        </ListStateBoundary>
      )}

      <Modal open={deciding !== null} onClose={() => setDeciding(null)} title={t('predictions.decide.title')}>
        {deciding ? (
          <form onSubmit={decisionForm.handleSubmit(onDecide)} noValidate>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
              {t('predictions.decide.advisoryReminder')}
            </p>
            {decideMutation.isError ? (
              <Alert variant="danger">
                {decideMutation.error instanceof ApiError ? decideMutation.error.message : t('errors.unknownError')}
              </Alert>
            ) : null}
            <FormField id="decision-choice" label={t('predictions.decide.decisionLabel')} required>
              <Select {...decisionForm.register('decision')}>
                <option value="ACCEPTED">{t('predictions.decide.decisionOptions.ACCEPTED')}</option>
                <option value="OVERRIDDEN">{t('predictions.decide.decisionOptions.OVERRIDDEN')}</option>
                <option value="DISMISSED">{t('predictions.decide.decisionOptions.DISMISSED')}</option>
              </Select>
            </FormField>
            {decisionValue === 'OVERRIDDEN' ? (
              <>
                <FormField
                  id="decision-override-reason"
                  label={t('predictions.decide.overrideReasonLabel')}
                  hint={t('predictions.decide.overrideReasonHint')}
                  error={decisionForm.formState.errors.overrideReason ? t('validation.required') : undefined}
                  required
                >
                  <TextInput {...decisionForm.register('overrideReason')} />
                </FormField>
                {deciding.type === 'REORDER_SUGGESTION' ? (
                  <FormField
                    id="decision-override-quantity"
                    label={t('predictions.decide.overrideQuantityLabel')}
                    hint={t('common.optional')}
                  >
                    <TextInput
                      type="number"
                      dirStable
                      {...decisionForm.register('overrideQuantity', { valueAsNumber: true })}
                    />
                  </FormField>
                ) : null}
              </>
            ) : null}
            <FormField id="decision-note" label={t('predictions.decide.noteLabel')} hint={t('common.optional')}>
              <TextInput {...decisionForm.register('note')} />
            </FormField>
            <Button type="submit" isLoading={decisionForm.formState.isSubmitting || decideMutation.isPending}>
              {t('predictions.decide.submit')}
            </Button>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}

function statusTone(status: PredictionStatus): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'ACCEPTED':
      return 'success'
    case 'OVERRIDDEN':
      return 'info'
    case 'DISMISSED':
    case 'SUPERSEDED':
      return 'neutral'
    case 'ACTIVE':
    default:
      return 'warning'
  }
}

function PredictionDetailSummary({ row }: { row: Prediction }) {
  const { t } = useTranslation()
  if (row.type === 'REORDER_SUGGESTION' && row.reorder) {
    return (
      <span className="dir-ltr">
        {row.reorder.input.partSku} → {row.reorder.result.suggestedQuantity}
      </span>
    )
  }
  if (row.type === 'TRAINING_RISK' && row.trainingRisk) {
    const level = row.trainingRisk.result.riskLevel
    return (
      <StatusBadge tone={level === 'HIGH' ? 'danger' : level === 'MEDIUM' ? 'warning' : 'success'}>
        {t(`predictions.list.riskLevelOptions.${level}`)}
      </StatusBadge>
    )
  }
  return <span>—</span>
}
