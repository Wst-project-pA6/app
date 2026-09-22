import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useCreatePartMutation } from '@/api/hooks/inventory'
import { useFinanceSettingsQuery } from '@/api/hooks/config'
import { ApiError } from '@/api/errors'
import { Alert, Button, FormField, Modal, TextInput, useToast } from '@/components'

const schema = z.object({
  sku: z.string().regex(/^[A-Z0-9][A-Z0-9._-]{1,63}$/),
  nameEn: z.string().min(1),
  nameAr: z.string().optional(),
  category: z.string().min(1).max(80),
  unitOfMeasure: z.string().min(1).max(20),
  sellingPrice: z.string().regex(/^\d{1,12}(\.\d{1,4})?$/),
})
type FormValues = z.infer<typeof schema>

export function CreatePartDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const mutation = useCreatePartMutation()
  const financeSettingsQuery = useFinanceSettingsQuery()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { sku: '', nameEn: '', nameAr: '', category: '', unitOfMeasure: 'EA', sellingPrice: '0.00' },
  })

  useEffect(() => {
    if (open) {
      reset({ sku: '', nameEn: '', nameAr: '', category: '', unitOfMeasure: 'EA', sellingPrice: '0.00' })
      mutation.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function onSubmit(values: FormValues) {
    try {
      await mutation.mutateAsync({
        sku: values.sku,
        name: values.nameAr ? { en: values.nameEn, ar: values.nameAr } : { en: values.nameEn },
        category: values.category,
        unitOfMeasure: values.unitOfMeasure,
        sellingPrice: { amount: values.sellingPrice, currency: financeSettingsQuery.data?.currencyCode ?? 'USD' },
      })
      showToast(t('inventory.parts.create.success'), 'success')
      onClose()
    } catch {
      // surfaced below
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('inventory.parts.create.title')}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        {mutation.isError ? (
          <Alert variant="danger">
            {mutation.error instanceof ApiError ? mutation.error.message : t('errors.unknownError')}
          </Alert>
        ) : null}
        <FormField
          id="part-sku"
          label={t('inventory.parts.columns.sku')}
          error={errors.sku ? t('inventory.parts.create.skuHint') : undefined}
          required
        >
          <TextInput dirStable className="dir-ltr" {...register('sku')} />
        </FormField>
        <FormField
          id="part-name-en"
          label={t('inventory.parts.create.nameEnLabel')}
          error={errors.nameEn ? t('validation.required') : undefined}
          required
        >
          <TextInput {...register('nameEn')} />
        </FormField>
        <FormField id="part-name-ar" label={t('inventory.parts.create.nameArLabel')} hint={t('common.optional')}>
          <TextInput dir="rtl" {...register('nameAr')} />
        </FormField>
        <FormField
          id="part-category"
          label={t('inventory.parts.columns.category')}
          error={errors.category ? t('validation.required') : undefined}
          required
        >
          <TextInput {...register('category')} />
        </FormField>
        <FormField id="part-uom" label={t('inventory.parts.create.unitOfMeasureLabel')} required>
          <TextInput dirStable {...register('unitOfMeasure')} />
        </FormField>
        <FormField
          id="part-price"
          label={t('inventory.parts.create.sellingPriceLabel')}
          error={errors.sellingPrice ? t('validation.required') : undefined}
          required
        >
          <TextInput dirStable {...register('sellingPrice')} />
        </FormField>
        <Button type="submit" isLoading={isSubmitting}>
          {t('inventory.parts.createAction')}
        </Button>
      </form>
    </Modal>
  )
}
