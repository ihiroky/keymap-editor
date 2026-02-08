const filter = require('lodash/filter')
const flatten = require('lodash/flatten')
const get = require('lodash/get')
const keyBy = require('lodash/keyBy')
const map = require('lodash/map')
const uniq = require('lodash/uniq')

const { renderTable } = require('./layout')
const defaults = require('./defaults')

const EDITOR_METADATA_KEY = '__keymap_editor'

const RENDERED_LAYERS = '{{rendered_layers}}'

function encodeBindValue (parsed) {
  const params = (parsed.params || []).map(encodeBindValue)
  const paramString = params.length > 0 ? `(${params.join(',')})` : ''
  return parsed.value + paramString
}

function encodeKeyBinding (parsed) {
  const { value, params } = parsed

  return `${value} ${params.map(encodeBindValue).join(' ')}`.trim()
}

function encodeLayerBindings (layers) {
  return layers.map(layer => layer.map(encodeKeyBinding))
}

function encodeKeymap (parsedKeymap) {
  const encoded = Object.assign({}, parsedKeymap, {
    layers: encodeLayerBindings(parsedKeymap.layers)
  })

  if (Array.isArray(parsedKeymap.sensor_layers)) {
    encoded.sensor_layers = encodeLayerBindings(parsedKeymap.sensor_layers)
  }

  return encoded
}

function stripEditorMetadata (keymap) {
  if (!keymap || typeof keymap !== 'object') {
    return keymap
  }
  if (!(EDITOR_METADATA_KEY in keymap)) {
    return keymap
  }

  const { [EDITOR_METADATA_KEY]: ignored, ...rest } = keymap
  return rest
}

function getBehavioursUsed (keymap) {
  const keybinds = flatten([
    ...(keymap.layers || []),
    ...(keymap.sensor_layers || [])
  ])
  return uniq(map(keybinds, 'value'))
}

function parseKeyBinding (binding) {
  const paramsPattern = /\((.+)\)/

  function parse (code) {
    const value = code.replace(paramsPattern, '')
    const params = get(code.match(paramsPattern), '[1]', '').split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(parse)

    return { value, params }
  }

  const value = binding.match(/^(&.+?)\b/)[1]
  const params = filter(binding.replace(/^&.+?\b\s*/, '')
    .split(' '))
    .map(parse)

  return { value, params }
}

function parseKeymap (keymap) {
  const parsed = Object.assign({}, keymap, {
    layers: keymap.layers.map(layer => {
      return layer.map(parseKeyBinding)
    })
  })

  if (Array.isArray(keymap.sensor_layers)) {
    parsed.sensor_layers = keymap.sensor_layers.map(layer => {
      return layer.map(parseKeyBinding)
    })
  }

  return parsed
}

function isSensorEditable (sensor) {
  if (!sensor || typeof sensor !== 'object') {
    return false
  }

  const compatible = sensor.compatible
  const hasCompatible = typeof compatible === 'string'
    ? compatible.trim().length > 0
    : compatible !== undefined && compatible !== null

  return hasCompatible || sensor.enabled === true
}

function filterEditableSensorBindings (sensorLayer, sensors) {
  if (!Array.isArray(sensorLayer)) {
    return sensorLayer
  }
  if (!Array.isArray(sensors) || sensors.length === 0) {
    return sensorLayer
  }

  return sensorLayer.filter((binding, index) => (
    isSensorEditable(sensors[index])
  ))
}

function normalizeBehaviorNode (node) {
  if (!node || typeof node !== 'object') {
    return null
  }

  const label = typeof node.label === 'string' && node.label.trim() ? node.label.trim() : null
  const name = typeof node.name === 'string' && node.name.trim() ? node.name.trim() : null
  if (!name) {
    return null
  }

  const bind = typeof node.bind === 'string' && node.bind.trim()
    ? node.bind.trim()
    : name.startsWith('&')
      ? name
      : label
        ? `&${label}`
        : `&${name}`

  const properties = node.properties && typeof node.properties === 'object'
    ? node.properties
    : {}
  const propertyTypes = node.property_types && typeof node.property_types === 'object'
    ? node.property_types
    : {}
  const propertyOrder = Array.isArray(node.property_order)
    ? node.property_order.filter(key => typeof key === 'string')
    : []

  return {
    label,
    name,
    bind,
    compatible: properties.compatible || node.compatible || null,
    properties,
    property_types: propertyTypes,
    property_order: propertyOrder,
    children: Array.isArray(node.children)
      ? node.children.map(normalizeBehaviorNode).filter(Boolean)
      : []
  }
}

function normalizeBehaviorList (nodes) {
  if (!Array.isArray(nodes)) {
    return []
  }

  return nodes
    .map(normalizeBehaviorNode)
    .filter(Boolean)
}

function generateKeymap (layout, keymap, template, options = {}) {
  const editorTemplate = keymap?.[EDITOR_METADATA_KEY]?.template
  const sanitized = stripEditorMetadata(keymap)
  const encoded = encodeKeymap(sanitized)
  const templateToUse = template || editorTemplate || defaults.keymapTemplate

  return {
    code: generateKeymapCode(layout, sanitized, encoded, templateToUse, options),
    json: generateKeymapJSON(layout, sanitized, encoded)
  }
}

const KEYMAP_BLOCK_TEMPLATE = `    keymap {
        compatible = "zmk,keymap";

${RENDERED_LAYERS}    };
`

function parseIncludeLine (line) {
  const match = line.match(/#include\s+([<"][^>"]+[>"])/)
  if (!match) {
    return null
  }

  const token = match[1]
  return {
    raw: `#include ${token}`,
    type: token.startsWith('<') ? 'system' : 'local'
  }
}

function collectIncludeLines (content) {
  const includes = []
  const lines = content.split('\n')
  for (const line of lines) {
    const parsed = parseIncludeLine(line)
    if (parsed) {
      includes.push(parsed)
    }
  }
  return includes
}

function normalizeIncludes (template, behaviourHeaders) {
  const templateIncludes = collectIncludeLines(template)
  const headerIncludes = behaviourHeaders
    .map(line => parseIncludeLine(line))
    .filter(Boolean)

  const seen = new Set()
  const systemIncludes = []
  const localIncludes = []

  const pushInclude = include => {
    if (seen.has(include.raw)) {
      return
    }
    seen.add(include.raw)
    if (include.type === 'system') {
      systemIncludes.push(include.raw)
    } else {
      localIncludes.push(include.raw)
    }
  }

  for (const include of [...templateIncludes, ...headerIncludes]) {
    pushInclude(include)
  }

  const block = [...systemIncludes, ...localIncludes].join('\n')
  const withoutIncludes = template.replace(/^\s*#include\s+[^\n]*\n?/gm, '')
  return { block, withoutIncludes }
}

function insertIncludes (template, includeBlock) {
  if (!includeBlock) {
    return template
  }

  const headerMatch = template.match(/^\s*\/\*[\s\S]*?\*\/\s*\n?/)
  if (headerMatch) {
    const header = headerMatch[0]
    return `${header}${includeBlock}\n${template.slice(header.length)}`
  }

  return `${includeBlock}\n${template}`
}

function renderLayers (params) {
  return params.layers.map((layer, i) => {
    const rawName = params.layerNames[i]
    let sanitizedRawName = String(rawName ?? i)
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '')
    const fallbackName = String(i)
    if (!sanitizedRawName) {
      sanitizedRawName = fallbackName
    }
    const normalizedName = /^[0-9]/.test(sanitizedRawName)
      ? `_${sanitizedRawName}`
      : sanitizedRawName
    const name = i === 0
      ? 'default_layer'
      : normalizedName
    const rendered = renderTable(params.layout, layer, {
      linePrefix: '',
      columnSeparator: ' ',
      align: 'left'
    })
    const sensorLayer = filterEditableSensorBindings(
      params.sensorLayers?.[i],
      params.sensors
    )
    const renderedSensors = Array.isArray(sensorLayer) && sensorLayer.length > 0
      ? `            sensor-bindings = <${sensorLayer.join(' ')}>;\n`
      : ''

    return `
        ${name} {
            bindings = <
${rendered}
            >;
${renderedSensors}        };
`
  }).join('')
}

function ensureArrayValue (value) {
  if (Array.isArray(value)) {
    return value
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map(entry => entry.trim())
      .filter(Boolean)
  }

  if (value === undefined || value === null || value === '') {
    return []
  }

  return [value]
}

function escapeString (value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
}

function renderBindingsValue (value) {
  const bindings = ensureArrayValue(value).map(entry => String(entry).trim()).filter(Boolean)
  if (!bindings.length) {
    return '<>'
  }

  if (bindings.length === 1) {
    return `<${bindings[0]}>`
  }

  return bindings.map(binding => `<${binding}>`).join(', ')
}

function renderTokenArrayValue (value) {
  const tokens = ensureArrayValue(value).map(entry => String(entry).trim()).filter(Boolean)
  return `<${tokens.join(' ')}>`
}

function renderDefaultPropertyValue (value) {
  if (Array.isArray(value)) {
    if (value.every(entry => typeof entry === 'string' && String(entry).trim().startsWith('&'))) {
      return renderBindingsValue(value)
    }

    return renderTokenArrayValue(value)
  }

  if (typeof value === 'number') {
    return `<${value}>`
  }

  const trimmed = String(value ?? '').trim()
  if (!trimmed) {
    return '""'
  }

  if (/^[A-Za-z0-9_&().+/-]+(?:\s+[A-Za-z0-9_&().+/-]+)*$/.test(trimmed)) {
    return `<${trimmed}>`
  }

  return `"${escapeString(trimmed)}"`
}

function renderPropertyLine (name, value, type, indent) {
  if (type === 'boolean' || typeof value === 'boolean') {
    return value ? `${indent}${name};\n` : ''
  }

  let renderedValue
  switch (type) {
    case 'string':
      renderedValue = `"${escapeString(value)}"`
      break
    case 'int':
    case 'uint':
    case 'number':
    case 'angle':
      renderedValue = `<${Number(value)}>`
      break
    case 'bindings':
      renderedValue = renderBindingsValue(value)
      break
    case 'token':
      renderedValue = `<${String(value).trim()}>`
      break
    case 'token-array':
    case 'cell-array':
      renderedValue = renderTokenArrayValue(value)
      break
    default:
      renderedValue = renderDefaultPropertyValue(value)
      break
  }

  return `${indent}${name} = ${renderedValue};\n`
}

function renderBehaviorNode (node, level, behaviourTypeByCompatible) {
  const indent = '    '.repeat(level)
  const header = node.label ? `${node.label}: ${node.name}` : node.name
  const compatible = node.properties?.compatible || node.compatible
  const behaviorType = compatible ? behaviourTypeByCompatible[compatible] : null
  const knownTypes = behaviorType?.propertyTypes || {}
  const explicitTypes = node.property_types || {}
  const properties = node.properties || {}
  const propertyOrder = Array.isArray(node.property_order) ? node.property_order : []
  const orderedKeys = [
    ...propertyOrder,
    ...Object.keys(properties).filter(key => !propertyOrder.includes(key))
  ]

  let body = ''
  for (const key of orderedKeys) {
    const type = explicitTypes[key] || knownTypes[key]
    body += renderPropertyLine(key, properties[key], type, `${indent}    `)
  }

  const children = Array.isArray(node.children) ? node.children : []
  for (const child of children) {
    body += renderBehaviorNode(child, level + 1, behaviourTypeByCompatible)
  }

  return `${indent}${header} {\n${body}${indent}};\n`
}

function renderBehaviorOverrides (nodes, behaviourTypeByCompatible) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return ''
  }

  return `${nodes.map(node => renderBehaviorNode(node, 0, behaviourTypeByCompatible)).join('')}\n`
}

function renderBehaviorDefinitions (nodes, behaviourTypeByCompatible) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return ''
  }

  const children = nodes.map(node => renderBehaviorNode(node, 2, behaviourTypeByCompatible)).join('')
  return `    behaviors {\n${children}    };\n`
}

function insertBeforeRoot (template, section) {
  if (!section) {
    return template
  }

  const rootMatch = template.match(/^\s*\/\s*\{/m)
  if (rootMatch && typeof rootMatch.index === 'number') {
    const index = rootMatch.index
    return `${template.slice(0, index)}${section}${template.slice(index)}`
  }

  return `${section}${template}`
}

function insertBeforeKeymap (template, section) {
  if (!section) {
    return template
  }

  const keymapMatch = template.match(/^[ \t]*keymap\s*\{/m)
  if (keymapMatch && typeof keymapMatch.index === 'number') {
    const index = keymapMatch.index
    return `${template.slice(0, index)}${section}${template.slice(index)}`
  }

  return `${template}\n${section}`
}

function renderTemplate (template, params) {
  const includesPattern = /\{\{\s*behaviour_includes\s*\}\}/
  const layersPattern = /\{\{\s*rendered_layers\s*\}\}/
  const keymapPattern = /\{\{\s*rendered_keymap\s*\}\}/
  const overridesPattern = /\{\{\s*rendered_behavior_overrides\s*\}\}/
  const definitionsPattern = /\{\{\s*rendered_behavior_definitions\s*\}\}/

  const renderedLayers = renderLayers(params)
  const renderedKeymap = KEYMAP_BLOCK_TEMPLATE.replace(layersPattern, renderedLayers)
  const renderedBehaviorOverrides = renderBehaviorOverrides(params.behaviorOverrides, params.behaviourTypeByCompatible)
  const renderedBehaviorDefinitions = renderBehaviorDefinitions(params.behaviorDefinitions, params.behaviourTypeByCompatible)

  const { block: includeBlock, withoutIncludes } = normalizeIncludes(template, params.behaviourHeaders)
  let output = withoutIncludes

  if (includesPattern.test(output)) {
    output = output.replace(includesPattern, includeBlock)
  } else {
    output = insertIncludes(output, includeBlock)
  }

  if (keymapPattern.test(output)) {
    output = output.replace(keymapPattern, renderedKeymap)
  }

  if (layersPattern.test(output)) {
    output = output.replace(layersPattern, renderedLayers)
  }

  if (overridesPattern.test(output)) {
    output = output.replace(overridesPattern, renderedBehaviorOverrides)
  } else {
    output = insertBeforeRoot(output, renderedBehaviorOverrides)
  }

  if (definitionsPattern.test(output)) {
    output = output.replace(definitionsPattern, renderedBehaviorDefinitions)
  } else {
    output = insertBeforeKeymap(output, renderedBehaviorDefinitions)
  }

  return output
}

function collectBehaviorTypeIncludes (nodes, behaviourTypeByCompatible) {
  const includes = []

  const traverse = item => {
    if (!item || typeof item !== 'object') {
      return
    }

    const compatible = item.properties?.compatible || item.compatible
    if (compatible && behaviourTypeByCompatible[compatible]?.defaultIncludes) {
      includes.push(...behaviourTypeByCompatible[compatible].defaultIncludes)
    }

    const children = Array.isArray(item.children) ? item.children : []
    children.forEach(traverse)
  }

  nodes.forEach(traverse)
  return includes
}

function generateKeymapCode (layout, keymap, encoded, template, options = {}) {
  const { layer_names: names = [] } = keymap
  const behavioursByBind = keyBy(options.behaviours || [], 'code')
  const behaviourTypeByCompatible = keyBy(options.behaviourTypes || [], 'compatible')

  const behaviorOverrides = normalizeBehaviorList(keymap.behavior_overrides)
  const behaviorDefinitions = normalizeBehaviorList(keymap.behavior_definitions)

  const keymapForIncludes = Array.isArray(keymap.sensor_layers)
    ? Object.assign({}, keymap, {
      sensor_layers: keymap.sensor_layers.map(layer => (
        filterEditableSensorBindings(layer, options.sensors)
      ))
    })
    : keymap

  const behaviourHeaders = flatten(getBehavioursUsed(keymapForIncludes).map(
    bind => get(behavioursByBind, [bind, 'includes'], [])
  ))

  const customBehaviorHeaders = collectBehaviorTypeIncludes(
    [...behaviorOverrides, ...behaviorDefinitions],
    behaviourTypeByCompatible
  )

  return renderTemplate(template, {
    layout,
    behaviourHeaders: [...behaviourHeaders, ...customBehaviorHeaders],
    layers: encoded.layers,
    layerNames: names,
    sensorLayers: encoded.sensor_layers,
    sensors: options.sensors,
    behaviorOverrides,
    behaviorDefinitions,
    behaviourTypeByCompatible
  })
}

function generateKeymapJSON (layout, keymap, encoded) {
  const base = JSON.stringify(Object.assign({}, encoded, { layers: null }), null, 2)
  const layers = encoded.layers.map(layer => {
    const rendered = renderTable(layout, layer, {
      useQuotes: true,
      linePrefix: '      '
    })

    return `[\n${rendered}\n    ]`
  })

  return base.replace('"layers": null', `"layers": [\n    ${layers.join(', ')}\n  ]`)
}

module.exports = {
  EDITOR_METADATA_KEY,
  encodeKeymap,
  parseKeyBinding,
  parseKeymap,
  generateKeymap
}
