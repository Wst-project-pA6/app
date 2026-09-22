import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { FieldSchema } from '@/api/endpoints/training'
import { Button, FormField, Select, TextInput } from '@/components'
import { initialValue, objectValue, scalarText, type FieldValue } from './fieldValues'
import styles from '../Stage5.module.css'

export function TrainingFields({
  schema,
  value,
  onChange,
  name = '',
  required = false,
}: {
  schema: FieldSchema
  value: FieldValue
  onChange: (value: FieldValue) => void
  name?: string
  required?: boolean
}) {
  const { t } = useTranslation()
  const id = useId()
  const label = t(`training.fields.${name}`)
  if (schema.type === 'object') {
    return (
      <div className={styles.formGrid}>
        {Object.entries(schema.properties ?? {}).map(([key, field]) => (
          <TrainingFields
            key={key}
            schema={field}
            name={key}
            value={objectValue(value)[key]}
            required={schema.required?.includes(key)}
            onChange={(next) => onChange({ ...objectValue(value), [key]: next })}
          />
        ))}
      </div>
    )
  }
  if (schema.type === 'array') {
    const values = Array.isArray(value) ? value : []
    return (
      <fieldset className={styles.wide}>
        <legend>{label}</legend>
        {values.map((entry, index) => (
          <div key={index} className={styles.page}>
            <TrainingFields
              schema={schema.items!}
              value={entry}
              name={name}
              required
              onChange={(next) => onChange(values.map((v, i) => (i === index ? next : v)))}
            />
            <Button type="button" variant="secondary" onClick={() => onChange(values.filter((_, i) => i !== index))}>
              {t('training.remove')}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={values.length >= (schema.maxItems ?? Infinity)}
          onClick={() => onChange([...values, initialValue(schema.items!)])}
        >
          {t('training.addItem', { field: label })}
        </Button>
        {required && values.length < (schema.minItems ?? 0) && (
          <p>{t('training.minimumItems', { count: schema.minItems })}</p>
        )}
      </fieldset>
    )
  }
  return (
    <FormField
      id={id}
      label={label}
      required={required}
      hint={schema.format === 'date-time' ? t('training.timestampHint') : undefined}
    >
      {schema.enum ? (
        <Select
          required={required}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">{t('training.choose')}</option>
          {schema.enum.map((option) => (
            <option key={option} value={option}>
              {t(`training.values.${option}`)}
            </option>
          ))}
        </Select>
      ) : schema.type === 'boolean' ? (
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
      ) : (
        <TextInput
          required={required}
          type={schema.type === 'integer' ? 'number' : schema.format === 'date' ? 'date' : 'text'}
          step={schema.type === 'integer' ? 1 : undefined}
          min={schema.minimum}
          max={schema.maximum}
          minLength={schema.minLength}
          maxLength={schema.maxLength}
          pattern={
            schema.format === 'uuid'
              ? '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
              : schema.pattern
          }
          dirStable={schema.format === 'uuid' || schema.format === 'date-time' || /Id$|Number$|Token$/.test(name)}
          value={typeof value === 'string' || typeof value === 'number' ? value : ''}
          onChange={(e) =>
            onChange(
              e.target.value === '' ? undefined : schema.type === 'integer' ? e.target.valueAsNumber : e.target.value,
            )
          }
        />
      )}
    </FormField>
  )
}

export function TrainingValue({ value, schema }: { value: unknown; schema: FieldSchema }) {
  const { t, i18n } = useTranslation()
  if (value === undefined || value === null) return <span>{t('training.unavailableValue')}</span>
  if (schema.properties?.en && schema.properties?.ar) {
    const localized = objectValue(value)
    return (
      <span>
        {scalarText(
          localized[i18n.language === 'ar' ? 'ar' : 'en'] ??
            localized.en ??
            localized.ar ??
            t('training.unavailableValue'),
        )}
      </span>
    )
  }
  if (schema.type === 'object')
    return (
      <dl className={styles.detailGrid}>
        {Object.entries(schema.properties ?? {}).map(([key, field]) => (
          <div key={key}>
            <dt>{t(`training.fields.${key}`)}</dt>
            <dd>
              <TrainingValue value={objectValue(value)[key]} schema={field} />
            </dd>
          </div>
        ))}
      </dl>
    )
  if (schema.type === 'array')
    return Array.isArray(value) && value.length ? (
      <ul>
        {value.map((v: unknown, i) => (
          <li key={i}>
            <TrainingValue value={v} schema={schema.items!} />
          </li>
        ))}
      </ul>
    ) : (
      <span>{t('training.empty')}</span>
    )
  if (typeof value === 'boolean') return <span>{t(value ? 'training.yes' : 'training.no')}</span>
  if (typeof value === 'object') return <span>{t('training.unavailableValue')}</span>
  return <bdi>{schema.enum ? t(`training.values.${scalarText(value)}`) : scalarText(value)}</bdi>
}
