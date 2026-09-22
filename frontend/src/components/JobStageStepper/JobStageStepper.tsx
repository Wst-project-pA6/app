import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { JobStage } from '@/api/types'
import styles from './JobStageStepper.module.css'

const STAGES: ReadonlyArray<JobStage> = ['RECEIVED', 'IN_PROGRESS', 'QUALITY_CHECK', 'READY', 'DELIVERED']

export interface JobStageStepperProps {
  stage: JobStage
}

/** Visual progress indicator for a job card's lifecycle stage. Never allows clicking past stages — transitions happen only through the Overview tab's controlled action. */
export function JobStageStepper({ stage }: JobStageStepperProps) {
  const { t } = useTranslation()
  const currentIndex = STAGES.indexOf(stage)

  return (
    <ol className={styles.stepper} aria-label={t('jobs.stageStepper.label')}>
      {STAGES.map((step, index) => {
        const isDone = index < currentIndex
        const isCurrent = index === currentIndex
        return (
          <li
            key={step}
            className={[styles.step, isDone ? styles.done : '', isCurrent ? styles.current : '']
              .filter(Boolean)
              .join(' ')}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <span className={styles.marker}>{isDone ? <Check size={14} aria-hidden="true" /> : index + 1}</span>
            <span className={styles.label}>{t(`jobs.stages.${step}`)}</span>
          </li>
        )
      })}
    </ol>
  )
}
