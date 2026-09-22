import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { trainingOperations, type TrainingOperation } from '@/api/endpoints/training'
import { useTrainingQuery } from '@/api/hooks/training'
import type { PageInfo, Permission } from '@/api/types'
import type { QueryParams } from '@/api/queryString'
import { PermissionGate } from '@/auth/PermissionRoute'
import { hasAnyPermission } from '@/auth/permissions'
import { useAuth } from '@/auth/useAuth'
import {
  Alert,
  Button,
  Card,
  LoadingIndicator,
  PageHeader,
  Pagination,
  SectionNav,
  Table,
  TextInput,
} from '@/components'
import { TrainingAction, TrainingError } from './TrainingAction'
import { ConflictPanel } from './ConflictPanel'
import { TrainingFields, TrainingValue } from './TrainingFields'
import { objectValue, scalarText, type FieldObject } from './fieldValues'
import { trainingResources, workflowOperations, type TrainingResource } from './resources'
import styles from '../Stage5.module.css'

function permissionsFor(section: string): Permission[] {
  const resource = trainingResources[section]
  const operations = resource
    ? [resource.list, resource.create, resource.update, resource.detail]
    : (workflowOperations[section] ??
      (section === 'coverage'
        ? ['getCompetencyCoverage' as const]
        : section === 'eligibility'
          ? ['getCompletionEligibility' as const]
          : []))
  return [...new Set(operations.flatMap((op) => (op ? trainingOperations[op].permissions : [])))]
}

export function TrainingPage() {
  const { section, recordId } = useParams()
  const { user } = useAuth()
  const { t } = useTranslation()
  const sections = [
    ...Object.keys(trainingResources),
    'conflicts',
    'transitions',
    'record-attendance',
    'sign-off',
    'coverage',
    'eligibility',
    'revoke',
  ]
  const active = section ?? sections.find((key) => hasAnyPermission(user, permissionsFor(key))) ?? 'sessions'
  if (!sections.includes(active)) return <Alert variant="warning">{t('training.notAvailable')}</Alert>
  return (
    <div className={styles.page}>
      <PageHeader title={t(`training.sections.${active}`)} />
      <SectionNav
        items={sections
          .filter((key) => hasAnyPermission(user, permissionsFor(key)))
          .map((key) => ({ to: `/training/${key}`, label: t(`training.sections.${key}`) }))}
      />
      <PermissionGate
        anyOf={
          recordId && trainingResources[active]?.detail
            ? trainingOperations[trainingResources[active].detail].permissions
            : permissionsFor(active)
        }
      >
        {trainingResources[active] ? (
          <ResourcePage
            key={`${active}:${recordId ?? ''}`}
            section={active}
            resource={trainingResources[active]}
            recordId={recordId}
          />
        ) : workflowOperations[active] ? (
          <WorkflowPage key={active} operations={workflowOperations[active]} />
        ) : (
          <ComputedPage
            key={active}
            operation={active === 'coverage' ? 'getCompetencyCoverage' : 'getCompletionEligibility'}
          />
        )}
      </PermissionGate>
    </div>
  )
}

function ResourcePage({
  section,
  resource,
  recordId,
}: {
  section: string
  resource: TrainingResource
  recordId?: string
}) {
  const { user } = useAuth()
  const { t } = useTranslation()
  const [search, setSearch] = useSearchParams()
  const [selected, setSelected] = useState<FieldObject | undefined>()
  const [showCreate, setShowCreate] = useState(false)
  const [filters, setFilters] = useState<FieldObject>({})
  const [applied, setApplied] = useState<QueryParams>({})
  const [page, setPage] = useState(1)
  const groupId = search.get('groupId') ?? ''
  const isDetail = Boolean(recordId && resource.detail)
  const operation = isDetail ? resource.detail! : resource.list
  const meta = trainingOperations[operation]
  const params = isDetail ? { [resource.idParam!]: recordId! } : section === 'enrollments' ? { groupId } : {}
  const query = useTrainingQuery(
    operation,
    params,
    isDetail ? {} : { ...applied, page, pageSize: 20, ...(section === 'calendar' ? { sort: 'startsAt' } : {}) },
    hasAnyPermission(user, meta.permissions) && (section !== 'enrollments' || Boolean(groupId)),
  )
  const data = objectValue(query.data)
  const rows = Array.isArray(data.items) ? data.items.map(objectValue) : []
  const rowSchema = trainingOperations[resource.list].response.properties!.items.items!
  const pageInfo = data.page as PageInfo | undefined
  return (
    <>
      {section === 'enrollments' && (
        <label>
          {t('training.fields.groupId')}
          <TextInput
            dirStable
            value={groupId}
            onChange={(e) => {
              setSearch({ groupId: e.target.value })
              setPage(1)
              setSelected(undefined)
            }}
          />
        </label>
      )}
      {section === 'calendar' && <Alert>{t('training.calendarHint')}</Alert>}
      {!isDetail && hasAnyPermission(user, meta.permissions) && (
        <form
          className={styles.page}
          onSubmit={(e) => {
            e.preventDefault()
            setApplied(filters as QueryParams)
            setPage(1)
            setSelected(undefined)
          }}
        >
          <TrainingFields
            schema={{
              ...meta.query,
              properties: Object.fromEntries(
                Object.entries(meta.query.properties ?? {}).filter(
                  ([key]) => !['page', 'pageSize', 'sort'].includes(key),
                ),
              ),
            }}
            value={filters}
            onChange={(v) => setFilters(objectValue(v))}
          />
          <Button type="submit" variant="secondary">
            {t('training.applyFilters')}
          </Button>
        </form>
      )}
      {!isDetail && resource.create && hasAnyPermission(user, trainingOperations[resource.create].permissions) && (
        <Button type="button" onClick={() => setShowCreate(!showCreate)}>
          {t(`training.actions.${resource.create}`)}
        </Button>
      )}
      {showCreate && resource.create && (
        <TrainingAction operation={resource.create} params={params} disabled={section === 'enrollments' && !groupId} />
      )}
      {query.isLoading && <LoadingIndicator />}
      {query.error && (
        <TrainingError
          error={query.error}
          onRetry={() => {
            void query.refetch()
          }}
        />
      )}
      {query.isSuccess && !isDetail && (
        <>
          {rows.length === 0 ? (
            <Alert>{t('training.empty')}</Alert>
          ) : (
            <Table
              rows={rows}
              getRowKey={(row) => scalarText(row.id)}
              columns={[
                ...resource.columns.map((key) => ({
                  key,
                  header: t(`training.fields.${key}`),
                  render: (row: FieldObject) => (
                    <TrainingValue value={row[key]} schema={rowSchema.properties?.[key] ?? { type: 'string' }} />
                  ),
                })),
                {
                  key: 'actions',
                  header: t('training.details'),
                  render: (row) =>
                    resource.detail ? (
                      <Link to={`/training/${section === 'calendar' ? 'sessions' : section}/${scalarText(row.id)}`}>
                        {t('training.details')}
                      </Link>
                    ) : (
                      <Button type="button" variant="secondary" onClick={() => setSelected(row)}>
                        {t('training.details')}
                      </Button>
                    ),
                },
              ]}
            />
          )}
          {pageInfo && (
            <Pagination
              {...pageInfo}
              onPageChange={(next) => {
                setPage(next)
                setSelected(undefined)
              }}
            />
          )}
        </>
      )}
      {isDetail && query.isSuccess && (
        <RecordDetail
          resource={resource}
          section={section}
          row={data}
          schema={meta.response}
          onUpdated={() => {
            void query.refetch()
          }}
        />
      )}
      {!isDetail && selected && (
        <RecordDetail
          key={`${scalarText(selected.id)}:${scalarText(selected.version)}`}
          resource={resource}
          section={section}
          row={selected}
          schema={rowSchema}
          onUpdated={(value) => setSelected(objectValue(value))}
        />
      )}
      {recordId && !resource.detail && <Alert>{t('training.noDetailEndpoint')}</Alert>}
    </>
  )
}

function RecordDetail({
  resource,
  section,
  row,
  schema,
  onUpdated,
}: {
  resource: TrainingResource
  section: string
  row: FieldObject
  schema: typeof trainingOperations.listStudents.response
  onUpdated: (value: unknown) => void
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const params = resource.idParam ? { [resource.idParam]: scalarText(row.id) } : {}
  const locked = section === 'assessments' && row.signOffStatus === 'SIGNED_OFF'
  return (
    <div className={styles.page}>
      <Card>
        <h2>{t('training.details')}</h2>
        <TrainingValue value={row} schema={schema} />
      </Card>
      {resource.update && (
        <TrainingAction
          operation={resource.update}
          params={params}
          initial={row}
          disabled={locked}
          onSuccess={onUpdated}
        />
      )}
      {section === 'groups' && (
        <Link to={`/training/enrollments?groupId=${encodeURIComponent(scalarText(row.id))}`}>
          {t('training.sections.enrollments')}
        </Link>
      )}
      {section === 'students' && (
        <div className={styles.actions}>
          <Link to={`/training/coverage?studentId=${encodeURIComponent(scalarText(row.id))}`}>
            {t('training.sections.coverage')}
          </Link>
          <Link to={`/training/eligibility?studentId=${encodeURIComponent(scalarText(row.id))}`}>
            {t('training.sections.eligibility')}
          </Link>
        </div>
      )}
      {section === 'assessments' && (
        <TrainingAction
          operation="signOffAssessment"
          params={params}
          disabled={locked || row.assessedBy === user?.id}
          onSuccess={onUpdated}
        />
      )}
      {section === 'sessions' && (
        <>
          <ConflictPanel
            sessionId={scalarText(row.id)}
            version={typeof row.version === 'number' ? row.version : undefined}
          />
          <TrainingAction operation="transitionTrainingSession" params={params} onSuccess={onUpdated} />
          <TrainingAction
            operation="recordSessionAttendance"
            params={params}
            disabled={!['PUBLISHED', 'COMPLETED'].includes(scalarText(row.status))}
          />
        </>
      )}
      {section === 'certificates' && (
        <>
          {typeof row.verificationToken === 'string' && (
            <Link to={`/public/certificate-verifications/${encodeURIComponent(row.verificationToken)}`}>
              {t('training.verify')}
            </Link>
          )}
          <TrainingAction
            operation="revokeCertificate"
            params={params}
            disabled={row.status === 'REVOKED'}
            onSuccess={onUpdated}
          />
        </>
      )}
    </div>
  )
}

function WorkflowPage({ operations }: { operations: TrainingOperation[] }) {
  const { t } = useTranslation()
  const [params, setParams] = useState<Record<string, string>>({})
  const fields = [...new Set(operations.flatMap((op) => trainingOperations[op].pathParams))]
  return (
    <div className={styles.page}>
      {fields.map((key) => (
        <label key={key}>
          {t(`training.fields.${key}`)}
          <TextInput
            dirStable
            value={params[key] ?? ''}
            onChange={(e) => setParams({ ...params, [key]: e.target.value })}
          />
        </label>
      ))}
      {operations.includes('checkTrainingSessionConflicts') ? (
        <ConflictPanel sessionId={params.sessionId ?? ''} />
      ) : (
        operations.map((operation) => (
          <TrainingAction
            key={operation}
            operation={operation}
            params={params}
            disabled={fields.some((key) => !params[key])}
          />
        ))
      )}
    </div>
  )
}

function ComputedPage({ operation }: { operation: 'getCompetencyCoverage' | 'getCompletionEligibility' }) {
  const { t } = useTranslation()
  const [search] = useSearchParams()
  const [studentId, setStudentId] = useState(search.get('studentId') ?? '')
  const [courseId, setCourseId] = useState('')
  const [applied, setApplied] = useState({ studentId: '', courseId: '' })
  const query = useTrainingQuery(
    operation,
    { studentId: applied.studentId },
    { courseId: applied.courseId },
    Boolean(applied.studentId && applied.courseId),
  )
  return (
    <>
      <form
        className={styles.page}
        onSubmit={(e) => {
          e.preventDefault()
          setApplied({ studentId, courseId })
        }}
      >
        <label>
          {t('training.fields.studentId')}
          <TextInput required dirStable value={studentId} onChange={(e) => setStudentId(e.target.value)} />
        </label>
        <label>
          {t('training.fields.courseId')}
          <TextInput required dirStable value={courseId} onChange={(e) => setCourseId(e.target.value)} />
        </label>
        <Button type="submit">{t('training.load')}</Button>
      </form>
      <Alert>{t('training.computedHint')}</Alert>
      {query.isLoading && <LoadingIndicator />}
      {query.error && (
        <TrainingError
          error={query.error}
          onRetry={() => {
            void query.refetch()
          }}
        />
      )}
      {query.isSuccess && (
        <Card>
          <TrainingValue value={query.data} schema={trainingOperations[operation].response} />
        </Card>
      )}
    </>
  )
}
