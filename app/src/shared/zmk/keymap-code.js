const KEYMAP_ROOT = {
  keyboard: 'unknown',
  keymap: 'unknown',
  layout: 'unknown'
}

const EDITOR_METADATA_KEY = '__keymap_editor'
const RENDERED_KEYMAP = '{{rendered_keymap}}'
const RENDERED_BEHAVIOR_OVERRIDES = '{{rendered_behavior_overrides}}'
const RENDERED_BEHAVIOR_DEFINITIONS = '{{rendered_behavior_definitions}}'

function stripComments (content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

function stripCommentsPreserveWidth (content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, match => match.replace(/[^\n]/g, ' '))
}

function isIdentifierChar (char) {
  return typeof char === 'string' && char.length === 1 && /[A-Za-z0-9_#-]/.test(char)
}

function expandRangeToTerminator (content, endIndex) {
  let end = endIndex + 1
  while (end < content.length && /\s/.test(content[end])) {
    end += 1
  }
  if (content[end] === ';') {
    end += 1
  }
  while (end < content.length && /[ \t]/.test(content[end])) {
    end += 1
  }
  if (content[end] === '\n') {
    end += 1
  }

  return end
}

function normalizeRangeStart (content, start) {
  const lineStart = content.lastIndexOf('\n', start - 1) + 1
  const prefix = content.slice(lineStart, start)
  return /^[ \t]*$/.test(prefix) ? lineStart : start
}

function extractBlockWithIndex (content, startIndex) {
  let depth = 0
  for (let i = startIndex; i < content.length; i += 1) {
    const char = content[i]
    if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return { block: content.slice(startIndex + 1, i), end: i }
      }
    }
  }

  return null
}

function findNamedBlockRange (content, blockName) {
  let inLineComment = false
  let inBlockComment = false
  let inString = false

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i]
    const next = content[i + 1]

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false
      }
      continue
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        i += 1
      }
      continue
    }

    if (inString) {
      if (char === '"' && content[i - 1] !== '\\') {
        inString = false
      }
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      i += 1
      continue
    }

    if (char === '/' && next === '*') {
      inBlockComment = true
      i += 1
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char !== blockName[0] || content.slice(i, i + blockName.length) !== blockName) {
      continue
    }

    const prev = content[i - 1]
    const nextChar = content[i + blockName.length]
    if (isIdentifierChar(prev) || isIdentifierChar(nextChar) || prev === '&' || prev === '/') {
      continue
    }

    let cursor = i + blockName.length
    while (cursor < content.length && /\s/.test(content[cursor])) {
      cursor += 1
    }

    if (content[cursor] !== '{') {
      continue
    }

    const extracted = extractBlockWithIndex(content, cursor)
    if (!extracted) {
      continue
    }

    const start = normalizeRangeStart(content, i)
    const end = expandRangeToTerminator(content, extracted.end)

    return { start, end }
  }

  return null
}

function findBlocks (content) {
  const blocks = []
  const pattern = /(?:([A-Za-z0-9_&/-]+)\s*:\s*)?([A-Za-z0-9_&/-]+)\s*\{/g
  let match

  while ((match = pattern.exec(content)) !== null) {
    const label = match[1] || null
    const name = match[2]
    const braceIndex = content.indexOf('{', match.index)
    const extracted = extractBlockWithIndex(content, braceIndex)
    if (!extracted) {
      break
    }

    const end = expandRangeToTerminator(content, extracted.end)
    blocks.push({
      label,
      name,
      content: extracted.block,
      start: match.index,
      end
    })
    pattern.lastIndex = end
  }

  return blocks
}

function parseBindings (bindingsBlock) {
  const tokens = bindingsBlock
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

  const bindings = []
  let current = []

  for (const token of tokens) {
    if (token.startsWith('&')) {
      if (current.length) {
        bindings.push(current.join(' '))
      }
      current = [token]
    } else if (current.length) {
      current.push(token)
    }
  }

  if (current.length) {
    bindings.push(current.join(' '))
  }

  return bindings
}

function normalizeAngleValue (value) {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (/^-?\d+$/.test(trimmed)) {
    return Number(trimmed)
  }
  return trimmed
}

function parsePropertyValue (rawValue) {
  const trimmed = rawValue.trim()
  const quoted = trimmed.match(/^"([\s\S]*)"$/)
  if (quoted) {
    return { value: quoted[1], type: 'string' }
  }

  const angleMatches = Array.from(trimmed.matchAll(/<([^>]+)>/g))
  if (angleMatches.length) {
    const values = angleMatches.map(match => normalizeAngleValue(match[1]))
    return {
      value: values.length === 1 ? values[0] : values,
      type: angleMatches.length > 1 ? 'bindings' : 'angle'
    }
  }

  return {
    value: normalizeAngleValue(trimmed),
    type: 'token'
  }
}

function parseProperties (content) {
  const properties = {}
  const propertyTypes = {}
  const ordered = []

  const assignments = []
  const assignmentPattern = /([A-Za-z0-9_#-]+)\s*=\s*([^;]+);/g
  let match
  while ((match = assignmentPattern.exec(content)) !== null) {
    assignments.push({
      index: match.index,
      name: match[1],
      rawValue: match[2],
      assignment: true
    })
  }

  const withoutAssignments = content.replace(assignmentPattern, assignment => (
    assignment.replace(/[^\n]/g, ' ')
  ))

  const booleans = []
  const booleanPattern = /([A-Za-z0-9_#-]+)\s*;/g
  while ((match = booleanPattern.exec(withoutAssignments)) !== null) {
    booleans.push({
      index: match.index,
      name: match[1],
      assignment: false
    })
  }

  for (const property of [...assignments, ...booleans].sort((a, b) => a.index - b.index)) {
    ordered.push(property.name)
    if (property.assignment) {
      const parsed = parsePropertyValue(property.rawValue)
      properties[property.name] = parsed.value
      propertyTypes[property.name] = parsed.type
    } else {
      properties[property.name] = true
      propertyTypes[property.name] = 'boolean'
    }
  }

  return { properties, propertyTypes, propertyOrder: ordered }
}

function stripBlocks (content, blocks) {
  let result = content
  const sorted = [...blocks].sort((a, b) => b.start - a.start)
  for (const block of sorted) {
    result = result.slice(0, block.start) + ' ' + result.slice(block.end)
  }
  return result
}

function parseNode (content) {
  const blocks = findBlocks(content)
  const childNodes = []
  const children = {}
  const order = []

  for (const block of blocks) {
    const node = parseNode(block.content)
    childNodes.push({
      label: block.label,
      name: block.name,
      node
    })
    children[block.name] = node
    order.push(block.name)
  }

  const stripped = stripBlocks(content, blocks)
  const { properties, propertyTypes, propertyOrder } = parseProperties(stripped)

  return {
    properties,
    propertyTypes,
    propertyOrder,
    childNodes,
    children,
    order
  }
}

function parseDts (content) {
  const cleaned = stripComments(content)
  const includes = Array.from(
    cleaned.matchAll(/^\s*#include\s+([<"][^>"]+[>"])\s*$/gm)
  ).map(match => match[1])
  const withoutIncludes = cleaned.replace(/^\s*#include\s+[<"][^>"]+[>"]\s*$/gm, '')

  const blocks = findBlocks(withoutIncludes)
  const nodes = {}
  const order = []
  const entries = []

  for (const block of blocks) {
    const node = parseNode(block.content)
    nodes[block.name] = node
    order.push(block.name)
    entries.push({
      label: block.label,
      name: block.name,
      node
    })
  }

  return { includes, nodes, order, entries }
}

function normalizeSensorBindings (sensorBindings, sensorCount) {
  const hasCount = Number.isInteger(sensorCount)
  if (!hasCount) {
    return sensorBindings
  }

  const normalized = Array.isArray(sensorBindings) ? sensorBindings.slice(0, sensorCount) : []
  while (normalized.length < sensorCount) {
    normalized.push('&none')
  }

  return normalized
}

function extractKeymapLayers (keymapNode, options = {}) {
  if (!keymapNode || !keymapNode.children) {
    return null
  }

  const layerNames = []
  const layers = []
  const sensorLayers = []
  const layerDetails = {}
  const order = keymapNode.order.length ? keymapNode.order : Object.keys(keymapNode.children)
  const sensorCount = options.sensorCount

  for (const name of order) {
    const layerNode = keymapNode.children[name]
    if (!layerNode || !layerNode.properties?.bindings) {
      continue
    }

    const bindings = typeof layerNode.properties.bindings === 'string'
      ? parseBindings(layerNode.properties.bindings)
      : Array.isArray(layerNode.properties.bindings)
        ? layerNode.properties.bindings.map(value => String(value))
        : []

    if (!bindings.length) {
      continue
    }

    const sensorBindingsRaw = layerNode.properties['sensor-bindings']
    const sensorBindings = typeof sensorBindingsRaw === 'string'
      ? parseBindings(sensorBindingsRaw)
      : Array.isArray(sensorBindingsRaw)
        ? sensorBindingsRaw.map(value => String(value))
        : undefined
    const normalizedSensorBindings = normalizeSensorBindings(sensorBindings, sensorCount)

    layerNames.push(name)
    layers.push(bindings)
    if (normalizedSensorBindings) {
      sensorLayers.push(normalizedSensorBindings)
    }
    layerDetails[name] = {
      properties: layerNode.properties,
      bindings,
      sensor_bindings: sensorBindings
    }
  }

  if (!layers.length) {
    return null
  }

  return { layerNames, layers, sensorLayers, layerDetails }
}

function toBehaviorNode (entry) {
  const { node } = entry
  const bind = entry.name.startsWith('&')
    ? entry.name
    : entry.label
      ? `&${entry.label}`
      : `&${entry.name}`

  return {
    label: entry.label || null,
    name: entry.name,
    bind,
    compatible: node.properties?.compatible || null,
    properties: node.properties || {},
    property_types: node.propertyTypes || {},
    property_order: node.propertyOrder || [],
    children: (node.childNodes || []).map(toBehaviorNode)
  }
}

function applyRanges (content, ranges) {
  let output = content
  const sorted = [...ranges]
    .filter(range => typeof range.start === 'number' && typeof range.end === 'number' && range.end > range.start)
    .sort((a, b) => b.start - a.start)

  for (const range of sorted) {
    output = output.slice(0, range.start) + range.replacement + output.slice(range.end)
  }

  return output
}

function trimTrailingBlankLines (value) {
  return value.replace(/(?:\n[ \t]*)+$/, '')
}

function trimLeadingBlankLines (value) {
  return value.replace(/^(?:[ \t]*\n)+/, '')
}

function insertSectionWithSingleBlankLine (before, section, after) {
  const parts = []
  if (before) {
    parts.push(before)
  }
  parts.push(section)
  if (after) {
    parts.push(after)
  }
  return parts.join('\n\n')
}

function insertPlaceholderBeforeKeymap (template, placeholder) {
  if (template.includes(placeholder)) {
    return template
  }

  const index = template.indexOf(RENDERED_KEYMAP)
  if (index !== -1) {
    const before = trimTrailingBlankLines(template.slice(0, index))
    const after = trimLeadingBlankLines(template.slice(index))
    return insertSectionWithSingleBlankLine(before, placeholder, after)
  }

  return insertSectionWithSingleBlankLine(
    trimTrailingBlankLines(template),
    placeholder,
    ''
  )
}

function insertPlaceholderAtTopLevel (template, placeholder) {
  if (template.includes(placeholder)) {
    return template
  }

  const rootMatch = template.match(/^\s*\/\s*\{/m)
  if (rootMatch && typeof rootMatch.index === 'number') {
    const index = rootMatch.index
    const before = trimTrailingBlankLines(template.slice(0, index))
    const after = trimLeadingBlankLines(template.slice(index))
    return insertSectionWithSingleBlankLine(before, placeholder, after)
  }

  return insertSectionWithSingleBlankLine('', placeholder, trimLeadingBlankLines(template))
}

function extractKeymapTemplate (content) {
  const keymapRange = findNamedBlockRange(content, 'keymap')
  if (!keymapRange) {
    return null
  }

  const preserved = stripCommentsPreserveWidth(content)
  const topBlocks = findBlocks(preserved)
  const behaviorDefinitionsRange = findNamedBlockRange(content, 'behaviors')

  const ranges = [
    { ...keymapRange, replacement: RENDERED_KEYMAP }
  ]

  if (behaviorDefinitionsRange) {
    ranges.push({ ...behaviorDefinitionsRange, replacement: RENDERED_BEHAVIOR_DEFINITIONS })
  }

  for (const block of topBlocks) {
    if (!block.name.startsWith('&')) {
      continue
    }
    const start = normalizeRangeStart(content, block.start)
    ranges.push({ start, end: block.end, replacement: '' })
  }

  let template = applyRanges(content, ranges)
  template = insertPlaceholderAtTopLevel(template, RENDERED_BEHAVIOR_OVERRIDES)
  template = insertPlaceholderBeforeKeymap(template, RENDERED_BEHAVIOR_DEFINITIONS)

  return template
}

function parseKeymapCode (content, options = {}) {
  const dts = parseDts(content)
  const keymapNode = dts.nodes['/']?.children?.keymap
  const extracted = extractKeymapLayers(keymapNode, options)
  if (!extracted) {
    return null
  }

  const rootNode = dts.nodes['/']
  const behaviorDefinitionsNode = rootNode?.children?.behaviors
  const behaviorDefinitions = Array.isArray(behaviorDefinitionsNode?.childNodes)
    ? behaviorDefinitionsNode.childNodes.map(toBehaviorNode)
    : []
  const behaviorOverrides = dts.entries
    .filter(entry => entry.name.startsWith('&'))
    .map(toBehaviorNode)

  const template = extractKeymapTemplate(content)
  const parsed = Object.assign({}, KEYMAP_ROOT, {
    layer_names: extracted.layerNames,
    layers: extracted.layers,
    sensor_layers: extracted.sensorLayers && extracted.sensorLayers.length
      ? extracted.sensorLayers
      : undefined,
    behavior_overrides: behaviorOverrides,
    behavior_definitions: behaviorDefinitions
  })

  if (template) {
    parsed[EDITOR_METADATA_KEY] = { template, source: 'code' }
  }

  return parsed
}

module.exports = {
  parseKeymapCode
}
