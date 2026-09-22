import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useCreateUserMutation } from '@/api/hooks/users'
import { ApiError } from '@/api/errors'
import { Alert, Button, FormField, PageHeader, PasswordInput, Select, TextInput, useToast } from '@/components'
import styles from './UserCreatePage.module.css'

const createUserSchema = z.object({
  email: z.string().min(1).email(),
  displayName: z.string().min(1),
  preferredLocale: z.enum(['en', 'ar']),
  temporaryPassword: z.string().min(1),
})

type CreateUserFormValues = z.infer<typeof createUserSchema>

export function UserCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const mutation = useCreateUserMutation()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { preferredLocale: 'en' },
  })

  // Never retain the temporary password in memory once the request has settled.
  useEffect(() => {
    if (mutation.isSuccess || mutation.isError) {
      reset({ email: '', displayName: '', preferredLocale: 'en', temporaryPassword: '' })
    }
  }, [mutation.isSuccess, mutation.isError, reset])

  async function onSubmit(values: CreateUserFormValues) {
    try {
      const created = await mutation.mutateAsync(values)
      showToast(t('access.users.create.success'), 'success')
      void navigate(`/access/users/${created.id}`, { replace: true })
    } catch {
      // surfaced via mutation.error below
    }
  }

  return (
    <div>
      <PageHeader title={t('access.users.create.title')} />

      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate autoComplete="off">
        {mutation.isError ? <CreateUserErrorAlert error={mutation.error} /> : null}

        <FormField
          id="user-email"
          label={t('access.users.create.emailLabel')}
          error={errors.email ? t('validation.email') : undefined}
          required
        >
          <TextInput type="email" autoComplete="off" dirStable {...register('email')} />
        </FormField>

        <FormField
          id="user-display-name"
          label={t('access.users.create.displayNameLabel')}
          error={errors.displayName ? t('validation.required') : undefined}
          required
        >
          <TextInput autoComplete="off" {...register('displayName')} />
        </FormField>

        <FormField id="user-locale" label={t('access.users.create.localeLabel')} required>
          <Select {...register('preferredLocale')}>
            <option value="en">{t('language.en')}</option>
            <option value="ar">{t('language.ar')}</option>
          </Select>
        </FormField>

        <FormField
          id="user-temporary-password"
          label={t('access.users.create.temporaryPasswordLabel')}
          hint={t('access.users.create.temporaryPasswordHint')}
          error={errors.temporaryPassword ? t('validation.required') : undefined}
          required
        >
          <PasswordInput autoComplete="new-password" {...register('temporaryPassword')} />
        </FormField>

        <Button type="submit" isLoading={isSubmitting}>
          {isSubmitting ? t('access.users.create.submitting') : t('access.users.create.submit')}
        </Button>
      </form>
    </div>
  )
}

function CreateUserErrorAlert({ error }: { error: unknown }) {
  const { t } = useTranslation()
  const message = error instanceof ApiError ? error.message : t('errors.unknownError')
  const requestId = error instanceof ApiError ? error.requestId : undefined

  return (
    <Alert variant="danger">
      {message}
      {requestId ? <div className="dir-ltr">{t('common.requestId', { id: requestId })}</div> : null}
    </Alert>
  )
}
