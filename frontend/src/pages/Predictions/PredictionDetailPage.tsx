import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import { useDecidePredictionMutation, usePredictionQuery } from '@/api/hooks/predictions'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  Alert,
  Button,
  Card,
  FormField,
  Modal,
  PageHeader,
  Select,
  StatusBadge,
  TextInput,
  useToast,
} from '@/components'
import { formatDateTime } from '@/lib/format'
import type { ReorderDetail, TrainingRiskDetail } from '@/api/types'
import { PredictionSourceTag } from './PredictionSourceTag'
import styles from '../Stage5.module.css'

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

export function PredictionDetailPage() {
  const { predictionId } = useParams<{ predictionId: string }>()
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const query = usePredictionQuery(predictionId)
  const prediction = query.data
  const decideMutation = useDecidePredictionMutation(predictionId ?? '')
  const [decideOpen, setDecideOpen] = useState(false)

  const decisionForm = useForm<DecisionFormValues>({
    resolver: zodResolver(decisionSchema),
    defaultValues: { decision: 'ACCEPTED' },
  })
  const decisionValue = decisionForm.watch('decision')

  const canDecide =
    prediction?.status === 'ACTIVE' &&
    ((prediction.type === 'REORDER_SUGGESTION' && hasAnyPermission(user, ['predictions.reorder.decide'])) ||
      (prediction.type === 'TRAINING_RISK' && hasAnyPermission(user, ['predictions.risk.decide'])))

  async function onDecide(values: DecisionFormValues) {
    try {
      await decideMutation.mutateAsync({
        decision: values.decision,
        overrideReason: values.decision === 'OVERRIDDEN' ? values.overrideReason : undefined,
        overrideQuantity: Number.isFinite(values.overrideQuantity) ? values.overrideQuantity : undefined,
        note: values.note || undefined,
      })
      showToast(t('predictions.decide.success'), 'success')
      setDecideOpen(false)
    } catch {
      // surfaced below
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('predictions.detail.title')}
        actions={<Link to="/predictions">{t('predictions.detail.backToList')}</Link>}
      />

      {query.isError && isUnavailableError(query.error) ? (
        <Alert variant="warning" title={t('predictions.unavailableTitle')}>
          <p>{t('predictions.unavailableMessage')}</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </Alert>
      ) : query.isError ? (
        <Alert variant="danger" title={t('errors.requestFailed')}>
          <p>{query.error instanceof ApiError ? query.error.message : t('errors.unknownError')}</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </Alert>
      ) : query.isLoading ? (
        <div role="status" aria-busy="true">
          {t('common.loading')}
        </div>
      ) : prediction ? (
        <>
          <Alert variant="info" title={t('predictions.advisoryNotice')}>
            <p>{t('predictions.advisoryReminder')}</p>
          </Alert>

          <Card title={prediction.explanation.summary}>
            <dl className={styles.detailGrid}>
              <div>
                <dt>{t('predictions.list.columns.type')}</dt>
                <dd>{t(`predictions.list.typeOptions.${prediction.type}`)}</dd>
              </div>
              <div>
                <dt>{t('common.status')}</dt>
                <dd>
                  <StatusBadge tone={statusTone(prediction.status)}>
                    {t(`predictions.list.statusOptions.${prediction.status}`)}
                  </StatusBadge>
                </dd>
              </div>
              <div>
                <dt>{t('predictions.detail.generatedAt')}</dt>
                <dd>{formatDateTime(prediction.generatedAt)}</dd>
              </div>
              <div>
                <dt>{t('predictions.list.columns.source')}</dt>
                <dd>
                  <PredictionSourceTag source={prediction.source} />
                </dd>
              </div>
            </dl>
          </Card>

          <Card title={t('predictions.detail.explanationTitle')}>
            <p>{prediction.explanation.summary}</p>
            {prediction.explanation.factors.length ? (
              <ul>
                {prediction.explanation.factors.map((factor) => (
                  <li key={factor.code}>
                    <span className="dir-ltr">{factor.code}</span>: {factor.message}
                    {factor.value ? (
                      <>
                        {' '}
                        — <span className="dir-ltr">{factor.value}</span>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          {prediction.type === 'REORDER_SUGGESTION' && prediction.reorder ? (
            <ReorderDetailCards reorder={prediction.reorder} />
          ) : null}
          {prediction.type === 'TRAINING_RISK' && prediction.trainingRisk ? (
            <TrainingRiskDetailCards trainingRisk={prediction.trainingRisk} />
          ) : null}

          <Card title={t('predictions.detail.decisionTitle')}>
            {prediction.decision ? (
              <dl className={styles.detailGrid}>
                <div>
                  <dt>{t('predictions.decide.decisionLabel')}</dt>
                  <dd>{t(`predictions.decide.decisionOptions.${prediction.decision.decision}`)}</dd>
                </div>
                <div>
                  <dt>{t('predictions.detail.decidedBy')}</dt>
                  <dd className="dir-ltr">{prediction.decision.decidedBy}</dd>
                </div>
                <div>
                  <dt>{t('predictions.detail.decidedAt')}</dt>
                  <dd>{formatDateTime(prediction.decision.decidedAt)}</dd>
                </div>
                {prediction.decision.overrideReason ? (
                  <div>
                    <dt>{t('predictions.detail.overrideReason')}</dt>
                    <dd>{prediction.decision.overrideReason}</dd>
                  </div>
                ) : null}
                {prediction.decision.overrideQuantity !== undefined ? (
                  <div>
                    <dt>{t('predictions.detail.overrideQuantity')}</dt>
                    <dd className="dir-ltr">{prediction.decision.overrideQuantity}</dd>
                  </div>
                ) : null}
                {prediction.decision.note ? (
                  <div>
                    <dt>{t('predictions.detail.note')}</dt>
                    <dd>{prediction.decision.note}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p>{t('predictions.detail.noDecision')}</p>
            )}
            {canDecide ? (
              <Button type="button" onClick={() => setDecideOpen(true)} style={{ marginTop: '1rem' }}>
                {t('predictions.list.decideAction')}
              </Button>
            ) : null}
          </Card>

          <Card title={t('predictions.detail.evaluationTitle')}>
            {prediction.evaluation ? (
              <dl className={styles.detailGrid}>
                <div>
                  <dt>{t('common.status')}</dt>
                  <dd>{t(`predictions.detail.evaluationOutcomes.${prediction.evaluation.outcome}`)}</dd>
                </div>
                {prediction.evaluation.evaluatedAt ? (
                  <div>
                    <dt>{t('predictions.detail.generatedAt')}</dt>
                    <dd>{formatDateTime(prediction.evaluation.evaluatedAt)}</dd>
                  </div>
                ) : null}
                {prediction.evaluation.note ? (
                  <div>
                    <dt>{t('predictions.detail.note')}</dt>
                    <dd>{prediction.evaluation.note}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p>{t('predictions.detail.noEvaluation')}</p>
            )}
          </Card>

          <Modal open={decideOpen} onClose={() => setDecideOpen(false)} title={t('predictions.decide.title')}>
            <form onSubmit={decisionForm.handleSubmit(onDecide)} noValidate>
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                {t('predictions.decide.advisoryReminder')}
              </p>
              {decideMutation.isError ? (
                <Alert variant="danger">
                  {decideMutation.error instanceof ApiError ? decideMutation.error.message : t('errors.unknownError')}
                </Alert>
              ) : null}
              <FormField id="detail-decision-choice" label={t('predictions.decide.decisionLabel')} required>
                <Select {...decisionForm.register('decision')}>
                  <option value="ACCEPTED">{t('predictions.decide.decisionOptions.ACCEPTED')}</option>
                  <option value="OVERRIDDEN">{t('predictions.decide.decisionOptions.OVERRIDDEN')}</option>
                  <option value="DISMISSED">{t('predictions.decide.decisionOptions.DISMISSED')}</option>
                </Select>
              </FormField>
              {decisionValue === 'OVERRIDDEN' ? (
                <>
                  <FormField
                    id="detail-decision-override-reason"
                    label={t('predictions.decide.overrideReasonLabel')}
                    hint={t('predictions.decide.overrideReasonHint')}
                    error={decisionForm.formState.errors.overrideReason ? t('validation.required') : undefined}
                    required
                  >
                    <TextInput {...decisionForm.register('overrideReason')} />
                  </FormField>
                  {prediction.type === 'REORDER_SUGGESTION' ? (
                    <FormField
                      id="detail-decision-override-quantity"
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
              <FormField
                id="detail-decision-note"
                label={t('predictions.decide.noteLabel')}
                hint={t('common.optional')}
              >
                <TextInput {...decisionForm.register('note')} />
              </FormField>
              <Button type="submit" isLoading={decisionForm.formState.isSubmitting || decideMutation.isPending}>
                {t('predictions.decide.submit')}
              </Button>
            </form>
          </Modal>
        </>
      ) : null}
    </div>
  )
}

function statusTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
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

function ReorderDetailCards({ reorder }: { reorder: ReorderDetail }) {
  const { t } = useTranslation()
  return (
    <>
      <Card title={t('predictions.detail.inputTitle')}>
        <dl className={styles.detailGrid}>
          <Field label={t('predictions.detail.reorder.storeId')} value={reorder.input.storeId} dirStable />
          <Field label={t('predictions.detail.reorder.partId')} value={reorder.input.partId} dirStable />
          <Field label={t('predictions.detail.reorder.partSku')} value={reorder.input.partSku} dirStable />
          <Field label={t('predictions.detail.reorder.onHand')} value={reorder.input.onHand} dirStable />
          <Field label={t('predictions.detail.reorder.reserved')} value={reorder.input.reserved} dirStable />
          <Field label={t('predictions.detail.reorder.available')} value={reorder.input.available} dirStable />
          <Field label={t('predictions.detail.reorder.minLevel')} value={reorder.input.minLevel} dirStable />
          <Field label={t('predictions.detail.reorder.maxLevel')} value={reorder.input.maxLevel} dirStable />
          <Field
            label={t('predictions.detail.reorder.openPurchaseOrderQuantity')}
            value={reorder.input.openPurchaseOrderQuantity}
            dirStable
          />
          <Field
            label={t('predictions.detail.reorder.averageWeeklyConsumption')}
            value={reorder.input.averageWeeklyConsumption}
            dirStable
          />
          <Field label={t('predictions.detail.reorder.lookbackWeeks')} value={reorder.input.lookbackWeeks} dirStable />
        </dl>
      </Card>
      <Card title={t('predictions.detail.resultTitle')}>
        <dl className={styles.detailGrid}>
          <Field
            label={t('predictions.detail.reorder.suggestedQuantity')}
            value={reorder.result.suggestedQuantity}
            dirStable
          />
          {reorder.result.estimatedWeeksOfCover ? (
            <Field
              label={t('predictions.detail.reorder.estimatedWeeksOfCover')}
              value={reorder.result.estimatedWeeksOfCover}
              dirStable
            />
          ) : null}
        </dl>
      </Card>
    </>
  )
}

function TrainingRiskDetailCards({ trainingRisk }: { trainingRisk: TrainingRiskDetail }) {
  const { t } = useTranslation()
  return (
    <>
      <Card title={t('predictions.detail.inputTitle')}>
        <dl className={styles.detailGrid}>
          <Field
            label={t('predictions.detail.trainingRisk.studentId')}
            value={trainingRisk.input.studentId}
            dirStable
          />
          <Field label={t('predictions.detail.trainingRisk.courseId')} value={trainingRisk.input.courseId} dirStable />
          <Field
            label={t('predictions.detail.trainingRisk.attendancePercent')}
            value={trainingRisk.input.attendancePercent}
            dirStable
          />
          <Field
            label={t('predictions.detail.trainingRisk.missingAttendanceSessions')}
            value={trainingRisk.input.missingAttendanceSessions}
            dirStable
          />
          <Field
            label={t('predictions.detail.trainingRisk.unsignedAssessmentCount')}
            value={trainingRisk.input.unsignedAssessmentCount}
            dirStable
          />
          <Field
            label={t('predictions.detail.trainingRisk.unmetCompetencyCount')}
            value={trainingRisk.input.unmetCompetencyCount}
            dirStable
          />
        </dl>
      </Card>
      <Card title={t('predictions.detail.resultTitle')}>
        <dl className={styles.detailGrid}>
          <div>
            <dt>{t('predictions.detail.trainingRisk.riskLevel')}</dt>
            <dd>
              <StatusBadge
                tone={
                  trainingRisk.result.riskLevel === 'HIGH'
                    ? 'danger'
                    : trainingRisk.result.riskLevel === 'MEDIUM'
                      ? 'warning'
                      : 'success'
                }
              >
                {t(`predictions.list.riskLevelOptions.${trainingRisk.result.riskLevel}`)}
              </StatusBadge>
            </dd>
          </div>
          <div>
            <dt>{t('predictions.detail.trainingRisk.flags')}</dt>
            <dd>
              {trainingRisk.result.flags.length
                ? trainingRisk.result.flags.map((flag) => t(`predictions.detail.flagOptions.${flag}`)).join(', ')
                : '—'}
            </dd>
          </div>
        </dl>
      </Card>
    </>
  )
}

function Field({ label, value, dirStable }: { label: string; value: string | number; dirStable?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={dirStable ? 'dir-ltr' : undefined}>{value}</dd>
    </div>
  )
}
