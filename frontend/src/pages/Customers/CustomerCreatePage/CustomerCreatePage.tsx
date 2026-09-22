import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { useCreateCustomerMutation } from '@/api/hooks/customers'
import { ApiError } from '@/api/errors'
import {
  Alert,
  Button,
  FormField,
  OrganizationScopeSelect,
  PageHeader,
  Select,
  TextInput,
  useToast,
} from '@/components'
import styles from './CustomerCreatePage.module.css'

const E164_PATTERN = /^\+[1-9]\d{1,14}$/

const schema = z.object({
  displayName: z.string().min(1),
  type: z.enum(['INDIVIDUAL', 'BUSINESS']),
  phone: z.string().regex(E164_PATTERN),
  email: z.union([z.string().email(), z.literal('')]),
  organizationScopeId: z.string().min(1),
  preferredChannel: z.enum(['', 'PHONE', 'SMS', 'EMAIL']),
  preferredLocale: z.enum(['', 'en', 'ar']),
})

type FormValues = z.infer<typeof schema>

export function CustomerCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const mutation = useCreateCustomerMutation()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: '',
      type: 'INDIVIDUAL',
      phone: '',
      email: '',
      organizationScopeId: '',
      preferredChannel: '',
      preferredLocale: '',
    },
  })

  const organizationScopeId = watch('organizationScopeId')

  async function onSubmit(values: FormValues) {
    const contactPreferences =
      values.preferredChannel || values.preferredLocale
        ? {
            ...(values.preferredChannel ? { preferredChannel: values.preferredChannel } : {}),
            ...(values.preferredLocale ? { preferredLocale: values.preferredLocale } : {}),
          }
        : undefined

    try {
      const created = await mutation.mutateAsync({
        displayName: values.displayName,
        type: values.type,
        phone: values.phone,
        organizationScopeId: values.organizationScopeId,
        ...(values.email ? { email: values.email } : {}),
        ...(contactPreferences ? { contactPreferences } : {}),
      })
      showToast(t('customers.create.success'), 'success')
      void navigate(`/customers/${created.id}`, { replace: true })
    } catch {
      // surfaced below
    }
  }

  return (
    <div>
      <PageHeader title={t('customers.create.title')} />

      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        {mutation.isError ? <CreateCustomerErrorAlert error={mutation.error} /> : null}

        <FormField
          id="customer-display-name"
          label={t('customers.create.displayNameLabel')}
          error={errors.displayName ? t('validation.required') : undefined}
          required
        >
          <TextInput {...register('displayName')} />
        </FormField>

        <FormField id="customer-type" label={t('customers.create.typeLabel')} required>
          <Select {...register('type')}>
            <option value="INDIVIDUAL">{t('customers.typeOptions.INDIVIDUAL')}</option>
            <option value="BUSINESS">{t('customers.typeOptions.BUSINESS')}</option>
          </Select>
        </FormField>

        <FormField
          id="customer-phone"
          label={t('customers.create.phoneLabel')}
          error={errors.phone ? t('validation.phoneE164') : undefined}
          required
        >
          <TextInput type="tel" autoComplete="tel" dirStable placeholder="+15551234567" {...register('phone')} />
        </FormField>

        <FormField
          id="customer-email"
          label={t('customers.create.emailLabel')}
          hint={t('common.optional')}
          error={errors.email ? t('validation.email') : undefined}
        >
          <TextInput type="email" autoComplete="email" dirStable {...register('email')} />
        </FormField>

        <div className={styles.field}>
          <label htmlFor="customer-scope" className={styles.label}>
            {t('customers.create.organizationScopeLabel')} <span aria-hidden="true">*</span>
          </label>
          <OrganizationScopeSelect
            id="customer-scope"
            value={organizationScopeId}
            onChange={(value) => setValue('organizationScopeId', value, { shouldValidate: true })}
            required
          />
          {errors.organizationScopeId ? <p className={styles.error}>{t('validation.required')}</p> : null}
        </div>

        <fieldset className={styles.fieldset}>
          <legend>{t('customers.create.contactPreferencesTitle')}</legend>

          <FormField id="customer-preferred-channel" label={t('customers.create.preferredChannelLabel')}>
            <Select {...register('preferredChannel')}>
              <option value="">{t('customers.create.noPreference')}</option>
              <option value="PHONE">{t('customers.channelOptions.PHONE')}</option>
              <option value="SMS">{t('customers.channelOptions.SMS')}</option>
              <option value="EMAIL">{t('customers.channelOptions.EMAIL')}</option>
            </Select>
          </FormField>

          <FormField id="customer-preferred-locale" label={t('customers.create.preferredLocaleLabel')}>
            <Select {...register('preferredLocale')}>
              <option value="">{t('customers.create.noPreference')}</option>
              <option value="en">{t('language.en')}</option>
              <option value="ar">{t('language.ar')}</option>
            </Select>
          </FormField>
        </fieldset>

        <Button type="submit" isLoading={isSubmitting}>
          {isSubmitting ? t('customers.create.submitting') : t('customers.create.submit')}
        </Button>
      </form>
    </div>
  )
}

function CreateCustomerErrorAlert({ error }: { error: unknown }) {
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
