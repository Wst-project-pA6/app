import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useAuthorizeAttachmentDownloadMutation,
  useJobAttachmentsQuery,
  useLinkJobAttachmentsMutation,
  useUploadAttachmentMutation,
} from '@/api/hooks/attachments'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import { Alert, Button, Card, ListStateBoundary, Table, useToast, type TableColumn } from '@/components'
import { formatDateTime } from '@/lib/format'
import type { Attachment, JobCard } from '@/api/types'

export function AttachmentsTab({ job }: { job: JobCard }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canUpload = hasAnyPermission(user, ['attachments.upload'])

  const attachmentsQuery = useJobAttachmentsQuery(job.id, {})
  const uploadMutation = useUploadAttachmentMutation()
  const linkMutation = useLinkJobAttachmentsMutation(job.id)
  const downloadMutation = useAuthorizeAttachmentDownloadMutation()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<unknown>(null)

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    try {
      const uploaded = await uploadMutation.mutateAsync({ file, purpose: 'JOB_PHOTO' })
      await linkMutation.mutateAsync({ attachmentIds: [uploaded.id] })
      showToast(t('jobs.attachments.uploadSuccess'), 'success')
    } catch (cause) {
      setError(cause)
    }
  }

  async function download(attachment: Attachment) {
    try {
      const authorization = await downloadMutation.mutateAsync(attachment.id)
      window.open(authorization.url, '_blank', 'noopener,noreferrer')
    } catch (cause) {
      setError(cause)
    }
  }

  const columns: ReadonlyArray<TableColumn<Attachment>> = [
    { key: 'fileName', header: t('jobs.attachments.columns.fileName'), render: (row) => row.fileName },
    {
      key: 'purpose',
      header: t('jobs.attachments.columns.purpose'),
      render: (row) => t(`jobs.attachments.purposeOptions.${row.purpose}`),
    },
    { key: 'createdAt', header: t('common.createdAt'), render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (row) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void download(row)}
          isLoading={downloadMutation.isPending}
        >
          {t('jobs.attachments.downloadAction')}
        </Button>
      ),
    },
  ]

  return (
    <Card title={t('jobs.tabs.attachments')}>
      {canUpload ? (
        <div style={{ marginBottom: '1rem' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={(event) => void handleFileSelected(event)}
            aria-label={t('jobs.attachments.uploadAction')}
          />
        </div>
      ) : null}

      {error ? <AttachmentErrorAlert error={error} /> : null}

      <ListStateBoundary
        isLoading={attachmentsQuery.isLoading}
        isError={attachmentsQuery.isError}
        error={attachmentsQuery.error}
        onRetry={() => void attachmentsQuery.refetch()}
        isEmpty={(attachmentsQuery.data?.items.length ?? 0) === 0}
        emptyTitle={t('jobs.attachments.empty.title')}
        emptyDescription={t('jobs.attachments.empty.description')}
      >
        <Table columns={columns} rows={attachmentsQuery.data?.items ?? []} getRowKey={(row) => row.id} />
      </ListStateBoundary>
    </Card>
  )
}

function AttachmentErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation()

  if (error instanceof ApiError && (error.code === 'PAYLOAD_TOO_LARGE' || error.code === 'UNSUPPORTED_MEDIA_TYPE')) {
    return (
      <Alert variant="danger" title={t('jobs.attachments.invalidFileTitle')}>
        {error.message}
      </Alert>
    )
  }

  const message = error instanceof ApiError ? error.message : t('errors.unknownError')
  const requestId = error instanceof ApiError ? error.requestId : undefined
  return (
    <Alert variant="danger">
      {message}
      {requestId ? <div className="dir-ltr">{t('common.requestId', { id: requestId })}</div> : null}
    </Alert>
  )
}
