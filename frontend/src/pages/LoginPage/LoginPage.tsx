import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Zap } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate, type Location } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { Alert, Button, FormField, PasswordInput, TextInput } from '@/components'
import styles from './LoginPage.module.css'

const loginSchema = z.object({
  email: z.string().min(1).email(),
  password: z.string().min(1),
})

type LoginFormValues = z.infer<typeof loginSchema>

interface LocationState {
  from?: Location
  registered?: boolean
}

export function LoginPage() {
  const { t } = useTranslation()
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [submitError, setSubmitError] = useState<ApiError | null>(null)
  const registered = (location.state as LocationState | null)?.registered ?? false

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) })

  if (status === 'authenticated') {
    return <Navigate to="/" replace />
  }

  const state = location.state as LocationState | null
  const from = state?.from

  async function onSubmit(values: LoginFormValues) {
    setSubmitError(null)
    try {
      const result = await login(values.email, values.password)
      if (result.mustChangePassword) {
        void navigate('/change-password', { replace: true, state: { from } })
      } else {
        void navigate(from ? `${from.pathname}${from.search}` : '/', { replace: true })
      }
    } catch (cause) {
      if (cause instanceof ApiError) {
        setSubmitError(cause)
      }
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.brand} aria-hidden="true">
        <span className={styles.brandMark}>
          <Zap size={22} strokeWidth={2.5} />
        </span>
        <span className={styles.brandName}>{t('app.name')}</span>
      </div>
      <form className={styles.card} onSubmit={handleSubmit(onSubmit)} noValidate>
        <h1 className={styles.title}>{t('auth.login.title')}</h1>
        <p className={styles.subtitle}>{t('auth.login.subtitle')}</p>

        {registered ? <Alert variant="success">{t('auth.register.successMessage')}</Alert> : null}
        {submitError ? <LoginErrorAlert error={submitError} /> : null}

        <FormField
          id="login-email"
          label={t('auth.login.emailLabel')}
          error={errors.email ? t('validation.email') : undefined}
          required
        >
          <TextInput type="email" autoComplete="username" dirStable {...register('email')} />
        </FormField>

        <FormField
          id="login-password"
          label={t('auth.login.passwordLabel')}
          error={errors.password ? t('validation.required') : undefined}
          required
        >
          <PasswordInput autoComplete="current-password" {...register('password')} />
        </FormField>

        <Button type="submit" isLoading={isSubmitting} className={styles.submit}>
          {isSubmitting ? t('auth.login.submitting') : t('auth.login.submit')}
        </Button>

        <p className={styles.footerLink}>
          {t('auth.login.noAccount')} <Link to="/register">{t('auth.login.createAccount')}</Link>
        </p>
      </form>
    </div>
  )
}

function LoginErrorAlert({ error }: { error: ApiError }) {
  const { t } = useTranslation()

  if (error.code === 'INVALID_CREDENTIALS') {
    return <Alert variant="danger">{t('auth.login.invalidCredentials')}</Alert>
  }

  if (error.isRateLimited) {
    return <Alert variant="warning">{t('auth.login.rateLimited', { seconds: error.retryAfterSeconds ?? 60 })}</Alert>
  }

  return (
    <Alert variant="danger">
      {t('auth.login.genericError')}
      {error.requestId ? <div>{t('common.requestId', { id: error.requestId })}</div> : null}
    </Alert>
  )
}
