// Prints UI metadata from the frozen contract. Does not modify the contract or generated types.
import fs from 'node:fs'
import yaml from 'js-yaml'

const contract = yaml.load(fs.readFileSync('openapi/wst-openapi.yaml', 'utf8'))
const resolve = (node) =>
  node?.$ref
    ? resolve(
        node.$ref
          .slice(2)
          .split('/')
          .reduce((v, k) => v[k], contract),
      )
    : node
function shape(input) {
  const node = resolve(input)
  if (!node) return undefined
  if (node.allOf) {
    const parts = node.allOf.map(shape)
    return {
      type: 'object',
      properties: Object.assign({}, ...parts.map((p) => p.properties)),
      required: parts.flatMap((p) => p.required ?? []),
    }
  }
  const result = {}
  for (const key of [
    'type',
    'format',
    'enum',
    'required',
    'minimum',
    'maximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'uniqueItems',
    'pattern',
  ]) {
    if (node[key] !== undefined) result[key] = node[key]
  }
  if (node.properties)
    result.properties = Object.fromEntries(Object.entries(node.properties).map(([k, v]) => [k, shape(v)]))
  if (node.items) result.items = shape(node.items)
  return result
}
const operations = {}
for (const [path, item] of Object.entries(contract.paths)) {
  if (
    !/^\/(training-|courses|mentors|students|enrollments|attendance-records|practical-tasks|assessments|competencies|certificates|public\/certificate)/.test(
      path,
    )
  )
    continue
  for (const [method, op] of Object.entries(item)) {
    if (!op.operationId) continue
    const parameters = [...(item.parameters ?? []), ...(op.parameters ?? [])].map(resolve)
    const response = op.responses['200'] ?? op.responses['201']
    operations[op.operationId] = {
      path,
      method: method.toUpperCase(),
      permissions: op['x-permissions'] ?? [],
      pathParams: parameters.filter((p) => p.in === 'path').map((p) => p.name),
      query: {
        type: 'object',
        properties: Object.fromEntries(
          parameters.filter((p) => p.in === 'query').map((p) => [p.name, shape(p.schema)]),
        ),
        required: parameters.filter((p) => p.in === 'query' && p.required).map((p) => p.name),
      },
      body: shape(op.requestBody?.content?.['application/json']?.schema),
      response: shape(response?.content?.['application/json']?.schema),
    }
  }
}
process.stdout.write(JSON.stringify(operations))
