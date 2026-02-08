const keyBy = require('lodash/keyBy')

const MACRO_COMPATIBLES = [
  'zmk,behavior-macro',
  'zmk,behavior-macro-one-param',
  'zmk,behavior-macro-two-param'
]

const MACRO_BINDING_CELLS = {
  'zmk,behavior-macro': 0,
  'zmk,behavior-macro-one-param': 1,
  'zmk,behavior-macro-two-param': 2
}

const MACRO_MODE_CONTROLS = [
  '&macro_tap',
  '&macro_press',
  '&macro_release',
  '&macro_pause_for_release',
  '&macro_pause_for_press'
]

const MACRO_TIME_CONTROLS = [
  '&macro_wait_time',
  '&macro_tap_time'
]

const MACRO_PARAM_FORWARD_CONTROLS = [
  '&macro_param_1to1',
  '&macro_param_1to2',
  '&macro_param_2to1',
  '&macro_param_2to2'
]

const MODE_CONTROL_SET = new Set(MACRO_MODE_CONTROLS)
const TIME_CONTROL_SET = new Set(MACRO_TIME_CONTROLS)
const PARAM_FORWARD_SET = new Set(MACRO_PARAM_FORWARD_CONTROLS)

function cloneDefinition (node) {
  if (!node || typeof node !== 'object') {
    return node
  }

  return {
    ...node,
    properties: { ...(node.properties || {}) },
    property_types: { ...(node.property_types || {}) },
    property_order: Array.isArray(node.property_order) ? [...node.property_order] : [],
    children: Array.isArray(node.children) ? [...node.children] : []
  }
}

function getNodeCompatible (node) {
  return node?.properties?.compatible || node?.compatible || ''
}

function isMacroCompatible (compatible) {
  return MACRO_COMPATIBLES.includes(String(compatible || ''))
}

function isMacroDefinition (node) {
  return isMacroCompatible(getNodeCompatible(node))
}

function splitBehaviorDefinitions (definitions) {
  const source = Array.isArray(definitions) ? definitions : []
  const macroDefinitions = []
  const behaviorDefinitions = []

  for (const definition of source) {
    if (isMacroDefinition(definition)) {
      macroDefinitions.push(definition)
    } else {
      behaviorDefinitions.push(definition)
    }
  }

  return { macroDefinitions, behaviorDefinitions }
}

function mergeBehaviorDefinitions (previousDefinitions, nextSubset, kind) {
  const source = Array.isArray(previousDefinitions) ? previousDefinitions : []
  const replacement = Array.isArray(nextSubset) ? [...nextSubset] : []
  const output = []

  for (const definition of source) {
    const isMacro = isMacroDefinition(definition)
    const matchesKind = kind === 'macro' ? isMacro : !isMacro

    if (!matchesKind) {
      output.push(definition)
      continue
    }

    if (!replacement.length) {
      continue
    }

    output.push(replacement.shift())
  }

  if (replacement.length > 0) {
    output.push(...replacement)
  }

  return output
}

function getMacroTypeMap (behaviorTypes) {
  return keyBy((behaviorTypes || []).filter(type => isMacroCompatible(type?.compatible)), 'compatible')
}

function getMissingMacroTypes (behaviorTypes) {
  const typeMap = getMacroTypeMap(behaviorTypes)
  return MACRO_COMPATIBLES.filter(compatible => !typeMap[compatible])
}

function hasRequiredMacroTypes (behaviorTypes) {
  return getMissingMacroTypes(behaviorTypes).length === 0
}

function ensureBindingArray (value) {
  if (Array.isArray(value)) {
    return value
      .map(entry => String(entry || '').trim())
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) {
      return []
    }

    if (text.includes('\n') || text.includes(',')) {
      return text
        .split(/[\n,]/)
        .map(entry => entry.trim())
        .filter(Boolean)
    }

    return [text]
  }

  return []
}

function splitBinding (binding) {
  const text = String(binding || '').trim()
  if (!text) {
    return { code: '', args: [] }
  }

  const parts = text.split(/\s+/)
  const code = parts.shift() || ''
  return { code, args: parts }
}

function parseMacroBinding (binding) {
  const text = String(binding || '').trim()
  const { code, args } = splitBinding(text)

  if (MODE_CONTROL_SET.has(code)) {
    return {
      type: 'mode-control',
      control: code,
      raw: text
    }
  }

  if (TIME_CONTROL_SET.has(code)) {
    return {
      type: 'time-control',
      control: code,
      value: args[0] || '',
      raw: text
    }
  }

  if (PARAM_FORWARD_SET.has(code)) {
    return {
      type: 'param-forward-control',
      control: code,
      raw: text
    }
  }

  return {
    type: 'behavior',
    behavior: code || '&none',
    paramsText: args.join(' '),
    raw: text
  }
}

function renderMacroBinding (step) {
  if (!step || typeof step !== 'object') {
    return ''
  }

  if (step.type === 'mode-control') {
    return String(step.control || '').trim()
  }

  if (step.type === 'param-forward-control') {
    return String(step.control || '').trim()
  }

  if (step.type === 'time-control') {
    const control = String(step.control || '').trim()
    const value = String(step.value || '').trim()
    return `${control} ${value}`.trim()
  }

  const behavior = String(step.behavior || '&none').trim()
  const paramsText = String(step.paramsText || '').trim()
  return `${behavior} ${paramsText}`.trim()
}

function parseRawMacroBindings (rawText) {
  return String(rawText || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

function renderRawMacroBindings (bindings) {
  return ensureBindingArray(bindings).join('\n')
}

function isIntegerString (value) {
  return /^-?\d+$/.test(String(value || '').trim())
}

function validateControlBinding (binding, compatible, index) {
  const errors = []
  const { code, args } = splitBinding(binding)
  const prefix = `Binding ${index + 1}`

  if (!code || !code.startsWith('&')) {
    errors.push(`${prefix}: must start with &`)
    return errors
  }

  if (MODE_CONTROL_SET.has(code)) {
    if (args.length !== 0) {
      errors.push(`${prefix}: ${code} does not accept arguments`)
    }
    return errors
  }

  if (TIME_CONTROL_SET.has(code)) {
    if (args.length !== 1 || !isIntegerString(args[0]) || Number(args[0]) < 0) {
      errors.push(`${prefix}: ${code} requires one non-negative integer argument`)
    }
    return errors
  }

  if (PARAM_FORWARD_SET.has(code)) {
    if (args.length !== 0) {
      errors.push(`${prefix}: ${code} does not accept arguments`)
    }

    if (compatible === 'zmk,behavior-macro') {
      errors.push(`${prefix}: ${code} requires macro binding-cells >= 1`)
    }

    if (compatible === 'zmk,behavior-macro-one-param' && (code === '&macro_param_2to1' || code === '&macro_param_2to2')) {
      errors.push(`${prefix}: ${code} requires macro binding-cells >= 2`)
    }

    return errors
  }

  if (code.startsWith('&macro_')) {
    errors.push(`${prefix}: unknown macro control ${code}`)
  }

  return errors
}

function validateMacroNode (node) {
  const errors = []
  const compatible = getNodeCompatible(node)

  if (!isMacroCompatible(compatible)) {
    errors.push('compatible must be a supported macro compatible value')
    return errors
  }

  const expectedBindingCells = MACRO_BINDING_CELLS[compatible]
  const actualBindingCells = Number(node?.properties?.['#binding-cells'])
  if (!Number.isInteger(actualBindingCells) || actualBindingCells !== expectedBindingCells) {
    errors.push(`#binding-cells must be fixed to ${expectedBindingCells} for ${compatible}`)
  }

  const bindings = ensureBindingArray(node?.properties?.bindings)
  if (bindings.length === 0) {
    errors.push('bindings must include at least one binding')
  }

  for (const key of ['wait-ms', 'tap-ms']) {
    if (!(key in (node?.properties || {}))) {
      continue
    }

    const value = node.properties[key]
    if (value === '' || value === null || value === undefined) {
      continue
    }

    const asNumber = Number(value)
    if (!Number.isInteger(asNumber) || asNumber < 0) {
      errors.push(`${key} must be a non-negative integer`)
    }
  }

  bindings.forEach((binding, index) => {
    errors.push(...validateControlBinding(binding, compatible, index))
  })

  return errors
}

function validateMacroCollection (definitions) {
  const nodes = Array.isArray(definitions) ? definitions : []
  const errors = []

  nodes.forEach((node, index) => {
    const nodeErrors = validateMacroNode(node)
    nodeErrors.forEach(error => {
      errors.push(`Macro ${index + 1}: ${error}`)
    })
  })

  return errors
}

module.exports = {
  MACRO_COMPATIBLES,
  MACRO_BINDING_CELLS,
  MACRO_MODE_CONTROLS,
  MACRO_TIME_CONTROLS,
  MACRO_PARAM_FORWARD_CONTROLS,
  cloneDefinition,
  ensureBindingArray,
  getMacroTypeMap,
  getMissingMacroTypes,
  hasRequiredMacroTypes,
  isMacroCompatible,
  isMacroDefinition,
  mergeBehaviorDefinitions,
  parseMacroBinding,
  parseRawMacroBindings,
  renderMacroBinding,
  renderRawMacroBindings,
  splitBehaviorDefinitions,
  validateMacroCollection,
  validateMacroNode
}
