import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, type Location } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { Alert, Button, FormField, PasswordInput } from '@/components'
import styles from './ChangePasswordPage.module.css'

function buildSchema(t: (key: string, options?: Record<string, unknown>) => string) {
  return z
    .object({
      currentPassword: z.string().min(1, t('validation.required')),
      newPassword: z.string().min(12, t('validation.minLength', { count: 12 })),
    })
    .refine((data) => data.currentPassword !== data.newPassword, {
      message: t('validation.passwordsMustDiffer'),
      path: ['newPassword'],
    })
}

type ChangePasswordFormValues = { currentPassword: string; newPassword: string }

interface LocationState {
  from?: Location
}

export function ChangePasswordPage() {
  const { t } = useTranslation()
  const { changePassword } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [submitError, setSubmitError] = useState<ApiError | null>(null)
  const [succeeded, setSucceeded] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({ resolver: zodResolver(buildSchema(t)) })

  const state = location.state as LocationState | null
  const from = state?.from

  async function onSubmit(values: ChangePasswordFormValues) {
    setSubmitError(null)
    try {
      await changePassword(values.currentPassword, values.newPassword)
      setSucceeded(true)
      void navigate(from ? `${from.pathname}${from.search}` : '/', { replace: true })
    } catch (cause) {
      if (cause instanceof ApiError) {
        setSubmitError(cause)
      }
    }
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit(onSubmit)} noValidate>
        <h1 className={styles.title}>{t('auth.changePassword.title')}</h1>
        <p className={styles.subtitle}>{t('auth.changePassword.subtitle')}</p>

        {succeeded ? <Alert variant="success">{t('auth.changePassword.success')}</Alert> : null}
        {submitError ? (
          <Alert variant="danger">
            {submitError.message}
            {submitError.requestId ? <div>{t('common.requestId', { id: submitError.requestId })}</div> : null}
          </Alert>
        ) : null}

        <FormField
          id="current-password"
          label={t('auth.changePassword.currentPasswordLabel')}
          error={errors.currentPassword?.message}
          required
        >
          <PasswordInput autoComplete="current-password" {...register('currentPassword')} />
        </FormField>

        <FormField
          id="new-password"
          label={t('auth.changePassword.newPasswordLabel')}
          hint={t('auth.changePassword.newPasswordHint')}
          error={errors.newPassword?.message}
          required
        >
          <PasswordInput autoComplete="new-password" {...register('newPassword')} />
        </FormField>

        <Button type="submit" isLoading={isSubmitting} className={styles.submit}>
          {isSubmitting ? t('auth.changePassword.submitting') : t('auth.changePassword.submit')}
        </Button>
      </form>
    </div>
  )
}
