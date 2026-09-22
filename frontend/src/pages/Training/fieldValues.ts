import type { FieldSchema } from '@/api/endpoints/training'

export type FieldValue = string | number | boolean | null | undefined | FieldValue[] | { [key: string]: FieldValue }
export type FieldObject = { [key: string]: FieldValue }
export function objectValue(value: unknown): FieldObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as FieldObject) : {}
}

// Only fields declared in the frozen schema are admitted to request bodies.
export function initialValue(schema: FieldSchema, value?: FieldValue): FieldValue {
  if (schema.type === 'object')
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).flatMap(([key, field]) => {
        const current = objectValue(value)[key]
        if (current === undefined && !schema.required?.includes(key)) return []
        return [[key, initialValue(field, current)]]
      }),
    )
  if (schema.type === 'array') return Array.isArray(value) ? value.map((v) => initialValue(schema.items!, v)) : []
  if (schema.enum && typeof value === 'string' && !schema.enum.includes(value)) return undefined
  return value ?? (schema.type === 'boolean' ? false : undefined)
}

export function validValue(schema: FieldSchema, value: FieldValue): boolean {
  if (schema.type === 'object')
    return Object.entries(schema.properties ?? {}).every(([key, field]) => {
      const child = objectValue(value)[key]
      return child === undefined ? !schema.required?.includes(key) : validValue(field, child)
    })
  if (schema.type === 'array')
    return (
      Array.isArray(value) &&
      value.length >= (schema.minItems ?? 0) &&
      value.length <= (schema.maxItems ?? Infinity) &&
      value.every((v) => validValue(schema.items!, v)) &&
      (!schema.uniqueItems || new Set(value.map((v) => JSON.stringify(v))).size === value.length)
    )
  if (schema.format === 'date-time')
    return (
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value) &&
      Number.isFinite(Date.parse(value))
    )
  if (schema.enum) return typeof value === 'string' && schema.enum.includes(value)
  if (schema.type === 'integer')
    return (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= (schema.minimum ?? -Infinity) &&
      value <= (schema.maximum ?? Infinity)
    )
  if (
    typeof value === 'string' &&
    (value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity))
  )
    return false
  return value !== undefined && value !== ''
}

export function scalarText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}
