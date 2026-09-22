import { Construction } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { EmptyState, PageHeader } from '@/components'

export interface PendingModulePageProps {
  /** i18next key under `nav.*` naming the module, e.g. "nav.customers". */
  moduleLabelKey: string
}

/**
 * Placeholder for a module whose navigation entry and route exist, but
 * whose real screens are not implemented in this stage. Never calls an
 * unimplemented endpoint and never displays fabricated data.
 */
export function PendingModulePage({ moduleLabelKey }: PendingModulePageProps) {
  const { t } = useTranslation()
  const moduleName = t(moduleLabelKey)

  return (
    <div>
      <PageHeader title={moduleName} />
      <EmptyState
        icon={<Construction size={40} aria-hidden="true" />}
        title={t('pendingModule.title', { module: moduleName })}
        description={t('pendingModule.message')}
      />
    </div>
  )
}
