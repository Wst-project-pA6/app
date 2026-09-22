import { zodResolver } from '@hookform/resolvers/zod'
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { usePartsQuery, useStoresQuery } from '@/api/hooks/inventory'
import { useFinanceSettingsQuery } from '@/api/hooks/config'
import { useCreatePurchaseOrderMutation, useVendorsQuery } from '@/api/hooks/purchasing'
import { ApiError } from '@/api/errors'
import { Alert, Button, FormField, PageHeader, Select, TextInput, useToast } from '@/components'

const lineSchema = z.object({
  partId: z.string().min(1),
  quantityOrdered: z.number().int().min(1),
  unitCost: z.string().regex(/^\d{1,12}(\.\d{1,4})?$/),
})

const schema = z.object({
  vendorId: z.string().min(1),
  storeId: z.string().min(1),
  lines: z.array(lineSchema).min(1),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().max(1000).optional(),
})
type FormValues = z.infer<typeof schema>

export function PurchaseOrderCreatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const mutation = useCreatePurchaseOrderMutation()
  const vendorsQuery = useVendorsQuery({ pageSize: 100, status: 'ACTIVE' })
  const storesQuery = useStoresQuery({ pageSize: 100, status: 'ACTIVE' })
  const partsQuery = usePartsQuery({ pageSize: 100, status: 'ACTIVE' })
  const financeSettingsQuery = useFinanceSettingsQuery()

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      vendorId: '',
      storeId: '',
      lines: [{ partId: '', quantityOrdered: 1, unitCost: '0.00' }],
      expectedDeliveryDate: '',
      notes: '',
    },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' })

  async function onSubmit(values: FormValues) {
    try {
      const currency = financeSettingsQuery.data?.currencyCode ?? 'USD'
      const created = await mutation.mutateAsync({
        vendorId: values.vendorId,
        storeId: values.storeId,
        lines: values.lines.map((line) => ({
          partId: line.partId,
          quantityOrdered: line.quantityOrdered,
          unitCost: { amount: line.unitCost, currency },
        })),
        ...(values.expectedDeliveryDate ? { expectedDeliveryDate: values.expectedDeliveryDate } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
      })
      showToast(t('purchasing.orders.create.success'), 'success')
      void navigate(`/purchasing/orders/${created.id}`, { replace: true })
    } catch {
      // surfaced below
    }
  }

  return (
    <div>
      <PageHeader title={t('purchasing.orders.create.title')} />

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '40rem' }}
      >
        {mutation.isError ? (
          <Alert variant="danger">
            {mutation.error instanceof ApiError ? mutation.error.message : t('errors.unknownError')}
            {mutation.error instanceof ApiError && mutation.error.requestId ? (
              <div className="dir-ltr">{t('common.requestId', { id: mutation.error.requestId })}</div>
            ) : null}
          </Alert>
        ) : null}

        <FormField
          id="po-vendor"
          label={t('purchasing.orders.vendorLabel')}
          error={errors.vendorId ? t('validation.required') : undefined}
          required
        >
          <Select {...register('vendorId')}>
            <option value="">{t('common.unassigned')}</option>
            {vendorsQuery.data?.items.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          id="po-store"
          label={t('jobs.parts.storeLabel')}
          error={errors.storeId ? t('validation.required') : undefined}
          required
        >
          <Select {...register('storeId')}>
            <option value="">{t('common.unassigned')}</option>
            {storesQuery.data?.items.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </Select>
        </FormField>

        <fieldset
          style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '1rem' }}
        >
          <legend>{t('purchasing.orders.linesLabel')}</legend>
          {fields.map((field, index) => (
            <div
              key={field.id}
              style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '0.75rem',
                alignItems: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              <FormField id={`po-line-part-${index}`} label={t('jobs.parts.partLabel')} required>
                <Select {...register(`lines.${index}.partId` as const)}>
                  <option value="">{t('common.unassigned')}</option>
                  {partsQuery.data?.items.map((part) => (
                    <option key={part.id} value={part.id}>
                      {part.sku}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField id={`po-line-qty-${index}`} label={t('jobs.parts.columns.quantity')} required>
                <TextInput
                  type="number"
                  dirStable
                  {...register(`lines.${index}.quantityOrdered` as const, { valueAsNumber: true })}
                />
              </FormField>
              <FormField id={`po-line-cost-${index}`} label={t('purchasing.orders.unitCostLabel')} required>
                <TextInput dirStable {...register(`lines.${index}.unitCost` as const)} />
              </FormField>
              {fields.length > 1 ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                  {t('common.cancel')}
                </Button>
              ) : null}
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => append({ partId: '', quantityOrdered: 1, unitCost: '0.00' })}
          >
            {t('purchasing.orders.addLine')}
          </Button>
        </fieldset>

        <FormField
          id="po-expected-delivery"
          label={t('purchasing.orders.columns.expectedDelivery')}
          hint={t('common.optional')}
        >
          <TextInput type="date" dirStable {...register('expectedDeliveryDate')} />
        </FormField>

        <FormField id="po-notes" label={t('purchasing.orders.notesLabel')} hint={t('common.optional')}>
          <TextInput {...register('notes')} />
        </FormField>

        <Button type="submit" isLoading={isSubmitting}>
          {isSubmitting ? t('purchasing.orders.create.submitting') : t('purchasing.orders.create.submit')}
        </Button>
      </form>
    </div>
  )
}
