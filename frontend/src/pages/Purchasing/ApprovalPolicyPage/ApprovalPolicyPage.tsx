import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { usePurchaseApprovalPolicyQuery, useReplacePurchaseApprovalPolicyMutation } from '@/api/hooks/purchasing'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/auth/useAuth'
import { hasAnyPermission } from '@/auth/permissions'
import { Alert, Button, Card, ListStateBoundary, PageHeader, TextInput, useToast } from '@/components'
import { SectionNav } from '@/components/SectionNav/SectionNav'
import { formatDateTime } from '@/lib/format'

const tierSchema = z.object({
  minimumTotal: z.string().regex(/^\d{1,12}(\.\d{1,4})?$/),
  requiredApprovals: z.union([z.literal(1), z.literal(2)]),
})
const schema = z.object({ tiers: z.array(tierSchema).min(1).max(5) })
type FormValues = z.infer<typeof schema>

export function ApprovalPolicyPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showToast } = useToast()
  const canManage = hasAnyPermission(user, ['config.manage'])

  const policyQuery = usePurchaseApprovalPolicyQuery()
  const mutation = useReplacePurchaseApprovalPolicyMutation()

  const { control, register, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { tiers: [{ minimumTotal: '0.00', requiredApprovals: 1 }] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'tiers' })

  useEffect(() => {
    if (policyQuery.data) {
      reset({
        tiers: policyQuery.data.tiers.map((tier) => ({
          minimumTotal: tier.minimumTotal,
          requiredApprovals: tier.requiredApprovals,
        })),
      })
    }
  }, [policyQuery.data, reset])

  async function onSubmit(values: FormValues) {
    if (!policyQuery.data) return
    try {
      await mutation.mutateAsync({ version: policyQuery.data.version, tiers: values.tiers })
      showToast(t('purchasing.policy.success'), 'success')
    } catch {
      // surfaced below
    }
  }

  return (
    <div>
      <PageHeader title={t('purchasing.policy.title')} />
      <SectionNav
        items={[
          { to: '/purchasing/vendors', label: t('purchasing.vendors.title') },
          { to: '/purchasing/orders', label: t('purchasing.orders.title') },
          { to: '/purchasing/approval-policy', label: t('purchasing.policy.title') },
        ]}
      />

      <ListStateBoundary
        isLoading={policyQuery.isLoading}
        isError={policyQuery.isError}
        error={policyQuery.error}
        onRetry={() => void policyQuery.refetch()}
        isEmpty={false}
        emptyTitle=""
      >
        {policyQuery.data ? (
          <Card title={t('purchasing.policy.title')}>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
              {t('purchasing.policy.updatedAt', { time: formatDateTime(policyQuery.data.updatedAt) })}
            </p>

            {mutation.isError ? (
              <Alert variant="danger">
                {mutation.error instanceof ApiError ? mutation.error.message : t('errors.unknownError')}
              </Alert>
            ) : null}

            <form onSubmit={handleSubmit(onSubmit)} noValidate>
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '0.75rem' }}
                >
                  <label>
                    {t('purchasing.policy.minimumTotalLabel')}
                    <TextInput dirStable disabled={!canManage} {...register(`tiers.${index}.minimumTotal` as const)} />
                  </label>
                  <label>
                    {t('purchasing.policy.requiredApprovalsLabel')}
                    <TextInput
                      type="number"
                      dirStable
                      disabled={!canManage}
                      {...register(`tiers.${index}.requiredApprovals` as const, { valueAsNumber: true })}
                    />
                  </label>
                  {canManage && fields.length > 1 ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                      {t('common.cancel')}
                    </Button>
                  ) : null}
                </div>
              ))}
              {canManage ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => append({ minimumTotal: '0.00', requiredApprovals: 1 })}
                    style={{ marginBottom: '1rem' }}
                  >
                    {t('purchasing.policy.addTier')}
                  </Button>
                  <div>
                    <Button type="submit" isLoading={formState.isSubmitting}>
                      {t('common.save')}
                    </Button>
                  </div>
                </>
              ) : null}
            </form>
          </Card>
        ) : null}
      </ListStateBoundary>
    </div>
  )
}
