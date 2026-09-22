import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useTrainingQuery } from '@/api/hooks/training'
import { trainingOperations } from '@/api/endpoints/training'
import { Card, LanguageSwitcher, LoadingIndicator, PageHeader } from '@/components'
import { TrainingError } from './TrainingAction'
import { TrainingValue } from './TrainingFields'
import styles from './Training.module.css'

// Explicit allowlist: never render extra server properties, auth state, internal ids, or error bodies.
const publicFields = [
  'certificateNumber',
  'holderDisplayName',
  'courseName',
  'issuedAt',
  'status',
  'revokedAt',
] as const
export function PublicCertificatePage() {
  const { verificationToken = '' } = useParams()
  const { t, i18n } = useTranslation()
  const query = useTrainingQuery('verifyCertificate', { verificationToken }, {}, Boolean(verificationToken))
  return (
    <main className={styles.publicPage} dir={i18n.dir()}>
      <LanguageSwitcher />
      <PageHeader title={t('training.verify')} />
      {query.isLoading && <LoadingIndicator />}
      {query.error && (
        <TrainingError
          error={query.error}
          publicView
          onRetry={() => {
            void query.refetch()
          }}
        />
      )}
      {query.data && (
        <Card>
          <dl>
            {publicFields.map((key) => (
              <div key={key}>
                <dt>{t(`training.fields.${key}`)}</dt>
                <dd>
                  <TrainingValue
                    value={query.data[key]}
                    schema={trainingOperations.verifyCertificate.response.properties![key]}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </main>
  )
}
