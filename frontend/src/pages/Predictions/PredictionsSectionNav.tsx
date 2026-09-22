import { useTranslation } from 'react-i18next'
import { SectionNav } from '@/components'

export function PredictionsSectionNav() {
  const { t } = useTranslation()
  return (
    <SectionNav
      items={[
        { to: '/predictions', label: t('predictions.list.title') },
        { to: '/predictions/settings', label: t('predictions.settings.title') },
      ]}
    />
  )
}
