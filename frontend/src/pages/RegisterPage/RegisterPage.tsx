import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Zap } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { registerUser } from '@/api/endpoints/authRegister'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { Alert, Button, FormField, PasswordInput, Select, TextInput } from '@/components'
import styles from '../LoginPage/LoginPage.module.css'

function buildSchema(t: (key: string, options?: Record<string, unknown>) => string) {
  return z
    .object({
      displayName: z.string().min(1, t('validation.required')),
      email: z.string().min(1, t('validation.required')).email(t('validation.email')),
      preferredLocale: z.enum(['en', 'ar']),
      password: z.string().min(12, t('validation.minLength', { count: 12 })),
      confirmPassword: z.string().min(1, t('validation.required')),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('auth.register.passwordsMustMatch'),
      path: ['confirmPassword'],
    })
}

type RegisterFormValues = {
  displayName: string
  email: string
  preferredLocale: 'en' | 'ar'
  password: string
  confirmPassword: string
}

export function RegisterPage() {
  const { t } = useTranslation()
  const { status } = useAuth()
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<ApiError | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(buildSchema(t)),
    defaultValues: { preferredLocale: 'en' },
  })

  if (status === 'authenticated') {
    return <Navigate to="/" replace />
  }

  async function onSubmit(values: RegisterFormValues) {
    setSubmitError(null)
    try {
      // Registration never signs the caller in: the new account has no
      // roles or scopes until an administrator assigns them.
      await registerUser({
        displayName: values.displayName,
        email: values.email,
        preferredLocale: values.preferredLocale,
        password: values.password,
      })
      void navigate('/login', { replace: true, state: { registered: true } })
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
      <form className={styles.card} onSubmit={handleSubmit(onSubmit)} noValidate autoComplete="off">
        <h1 className={styles.title}>{t('auth.register.title')}</h1>
        <p className={styles.subtitle}>{t('auth.register.subtitle')}</p>

        {submitError ? (
          <Alert variant="danger">
            {submitError.message}
            {submitError.requestId ? (
              <div className="dir-ltr">{t('common.requestId', { id: submitError.requestId })}</div>
            ) : null}
          </Alert>
        ) : null}

        <FormField
          id="register-display-name"
          label={t('auth.register.displayNameLabel')}
          error={errors.displayName?.message}
          required
        >
          <TextInput autoComplete="name" {...register('displayName')} />
        </FormField>

        <FormField id="register-email" label={t('auth.register.emailLabel')} error={errors.email?.message} required>
          <TextInput type="email" autoComplete="email" dirStable {...register('email')} />
        </FormField>

        <FormField id="register-locale" label={t('auth.register.localeLabel')} required>
          <Select {...register('preferredLocale')}>
            <option value="en">{t('language.en')}</option>
            <option value="ar">{t('language.ar')}</option>
          </Select>
        </FormField>

        <FormField
          id="register-password"
          label={t('auth.register.passwordLabel')}
          hint={t('auth.changePassword.newPasswordHint')}
          error={errors.password?.message}
          required
        >
          <PasswordInput autoComplete="new-password" {...register('password')} />
        </FormField>

        <FormField
          id="register-confirm-password"
          label={t('auth.register.confirmPasswordLabel')}
          error={errors.confirmPassword?.message}
          required
        >
          <PasswordInput autoComplete="new-password" {...register('confirmPassword')} />
        </FormField>

        <Button type="submit" isLoading={isSubmitting} className={styles.submit}>
          {isSubmitting ? t('auth.register.submitting') : t('auth.register.submit')}
        </Button>

        <p className={styles.footerLink}>
          {t('auth.register.haveAccount')} <Link to="/login">{t('auth.register.signIn')}</Link>
        </p>
      </form>
    </div>
  )
}
