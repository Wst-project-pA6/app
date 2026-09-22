import { useTranslation } from 'react-i18next'
import { SectionNav } from '@/components/SectionNav/SectionNav'

export function InventorySectionNav() {
  const { t } = useTranslation()
  return (
    <SectionNav
      items={[
        { to: '/inventory/parts', label: t('inventory.parts.title') },
        { to: '/inventory/stores', label: t('inventory.stores.title') },
        { to: '/inventory/movements', label: t('inventory.movements.title') },
        { to: '/inventory/reconciliation', label: t('inventory.reconciliation.title') },
        { to: '/inventory/adjustments', label: t('inventory.adjustments.title') },
      ]}
    />
  )
}
