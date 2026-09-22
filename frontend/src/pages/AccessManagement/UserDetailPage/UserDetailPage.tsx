import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import { useUpdateUserMutation, useUserQuery } from '@/api/hooks/users'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  FormField,
  ListStateBoundary,
  PageHeader,
  PasswordInput,
  Select,
  StatusBadge,
  TextInput,
  useToast,
} from '@/components'
import { formatDateTime } from '@/lib/format'
import { RoleAssignmentPanel } from './RoleAssignmentPanel'
import { ScopeAssignmentPanel } from './ScopeAssignmentPanel'
import styles from './UserDetailPage.module.css'

const profileSchema = z.object({
  displayName: z.string().min(1),
  preferredLocale: z.enum(['en', 'ar']),
  status: z.enum(['ACTIVE', 'DISABLED']),
  temporaryPassword: z.string().optional(),
})

type ProfileFormValues = z.infer<typeof profileSchema>

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const { t } = useTranslation()
  const { user: currentUser } = useAuth()
  const { showToast } = useToast()

  const userQuery = useUserQuery(userId)
  const updateMutation = useUpdateUserMutation(userId ?? '')

  const canManage = hasAnyPermission(currentUser, ['users.manage'])
  const [pendingDisable, setPendingDisable] = useState<ProfileFormValues | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({ resolver: zodResolver(profileSchema) })

  useEffect(() => {
    if (userQuery.data) {
      reset({
        displayName: userQuery.data.displayName,
        preferredLocale: userQuery.data.preferredLocale,
        status: userQuery.data.status,
        temporaryPassword: '',
      })
    }
  }, [userQuery.data, reset])

  useEffect(() => {
    if (updateMutation.isSuccess || updateMutation.isError) {
      // Never retain a submitted temporary password in form state.
      reset({ ...getValues(), temporaryPassword: '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateMutation.isSuccess, updateMutation.isError])

  async function submitProfile(values: ProfileFormValues) {
    const payload = {
      displayName: values.displayName,
      preferredLocale: values.preferredLocale,
      status: values.status,
      ...(values.temporaryPassword ? { temporaryPassword: values.temporaryPassword } : {}),
    }
    try {
      await updateMutation.mutateAsync(payload)
      showToast(t('access.users.detail.saveSuccess'), 'success')
    } catch {
      // surfaced via updateMutation.error below
    }
  }

  function onSubmit(values: ProfileFormValues) {
    if (values.status === 'DISABLED' && userQuery.data?.status !== 'DISABLED') {
      setPendingDisable(values)
      return
    }
    void submitProfile(values)
  }

  function confirmDisable() {
    if (pendingDisable) {
      void submitProfile(pendingDisable)
    }
    setPendingDisable(null)
  }

  return (
    <div>
      <PageHeader
        title={t('access.users.detail.title')}
        actions={<Link to="/access/users">{t('access.users.detail.backToList')}</Link>}
      />

      <ListStateBoundary
        isLoading={userQuery.isLoading}
        isError={userQuery.isError}
        error={userQuery.error}
        onRetry={() => void userQuery.refetch()}
        isEmpty={false}
        emptyTitle=""
      >
        {userQuery.data ? (
          <div className={styles.grid}>
            <Card title={t('access.users.detail.profileSection')}>
              {updateMutation.isError ? <UpdateUserErrorAlert error={updateMutation.error} /> : null}

              <form onSubmit={handleSubmit(onSubmit)} noValidate autoComplete="off" className={styles.form}>
                <dl className={styles.readonlyList}>
                  <div>
                    <dt>{t('access.users.columns.email')}</dt>
                    <dd className="dir-ltr">{userQuery.data.email}</dd>
                  </div>
                  <div>
                    <dt>{t('access.users.detail.lastLoginAt')}</dt>
                    <dd>
                      {userQuery.data.lastLoginAt
                        ? formatDateTime(userQuery.data.lastLoginAt)
                        : t('access.users.detail.never')}
                    </dd>
                  </div>
                  {userQuery.data.mustChangePassword ? (
                    <div>
                      <dd>
                        <StatusBadge tone="warning">{t('access.users.detail.mustChangePassword')}</StatusBadge>
                      </dd>
                    </div>
                  ) : null}
                </dl>

                <FormField
                  id="profile-display-name"
                  label={t('access.users.detail.displayNameLabel')}
                  error={errors.displayName ? t('validation.required') : undefined}
                  required
                >
                  <TextInput autoComplete="off" disabled={!canManage} {...register('displayName')} />
                </FormField>

                <FormField id="profile-locale" label={t('access.users.detail.localeLabel')} required>
                  <Select disabled={!canManage} {...register('preferredLocale')}>
                    <option value="en">{t('language.en')}</option>
                    <option value="ar">{t('language.ar')}</option>
                  </Select>
                </FormField>

                <FormField id="profile-status" label={t('access.users.detail.statusLabel')} required>
                  <Select disabled={!canManage} {...register('status')}>
                    <option value="ACTIVE">{t('access.users.statusOptions.ACTIVE')}</option>
                    <option value="DISABLED">{t('access.users.statusOptions.DISABLED')}</option>
                  </Select>
                </FormField>

                <FormField
                  id="profile-reset-password"
                  label={t('access.users.detail.resetPasswordLabel')}
                  hint={t('access.users.detail.resetPasswordHint')}
                >
                  <PasswordInput autoComplete="new-password" disabled={!canManage} {...register('temporaryPassword')} />
                </FormField>

                {canManage ? (
                  <Button type="submit" isLoading={isSubmitting}>
                    {isSubmitting ? t('access.users.detail.saving') : t('access.users.detail.saveProfile')}
                  </Button>
                ) : null}
              </form>
            </Card>

            <RoleAssignmentPanel user={userQuery.data} currentUserId={currentUser?.id} />
            <ScopeAssignmentPanel user={userQuery.data} />
          </div>
        ) : null}
      </ListStateBoundary>

      <ConfirmDialog
        open={pendingDisable !== null}
        title={t('access.users.detail.disableConfirmTitle')}
        description={t('access.users.detail.disableConfirmDescription')}
        tone="danger"
        confirmLabel={t('access.users.detail.saveProfile')}
        isLoading={updateMutation.isPending}
        onConfirm={confirmDisable}
        onCancel={() => setPendingDisable(null)}
      />
    </div>
  )
}

function UpdateUserErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation()

  if (error instanceof ApiError && error.code === 'SEPARATION_OF_DUTIES_VIOLATION') {
    return (
      <Alert variant="danger" title={t('access.users.detail.separationOfDutiesTitle')}>
        {t('access.users.detail.separationOfDutiesMessage')}
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
