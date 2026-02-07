const KEYMAP_ROOT = {
  keyboard: 'unknown',
  keymap: 'unknown',
  layout: 'unknown'
}

const EDITOR_METADATA_KEY = '__keymap_editor'

function stripComments (content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

function isIdentifierChar (char) {
  return typeof char === 'string' && char.length === 1 && /[A-Za-z0-9_-]/.test(char)
}

function findKeymapBlockRange (content) {
  let inLineComment = false
  let inBlockComment = false
  let inString = false

  const length = content.length
  for (let i = 0; i < length; i += 1) {
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

    if (char === 'k' && content.slice(i, i + 6) === 'keymap') {
      const prev = content[i - 1]
      const nextChar = content[i + 6]
      if (isIdentifierChar(prev) || isIdentifierChar(nextChar) || prev === '&' || prev === '/') {
        continue
      }

      let cursor = i + 6
      while (cursor < length && /\s/.test(content[cursor])) {
        cursor += 1
      }
      if (content[cursor] !== '{') {
        continue
      }

      let depth = 1
      let j = cursor + 1
      let blockLineComment = false
      let blockComment = false
      let blockString = false
      for (; j < length; j += 1) {
        const current = content[j]
        const upcoming = content[j + 1]

        if (blockLineComment) {
          if (current === '\n') {
            blockLineComment = false
          }
          continue
        }

        if (blockComment) {
          if (current === '*' && upcoming === '/') {
            blockComment = false
            j += 1
          }
          continue
        }

        if (blockString) {
          if (current === '"' && content[j - 1] !== '\\') {
            blockString = false
          }
          continue
        }

        if (current === '/' && upcoming === '/') {
          blockLineComment = true
          j += 1
          continue
        }

        if (current === '/' && upcoming === '*') {
          blockComment = true
          j += 1
          continue
        }

        if (current === '"') {
          blockString = true
          continue
        }

        if (current === '{') {
          depth += 1
        } else if (current === '}') {
          depth -= 1
          if (depth === 0) {
            let end = j + 1
            while (end < length && /\s/.test(content[end])) {
              end += 1
            }
            if (content[end] === ';') {
              end += 1
            }
            return { start: i, end }
          }
        }
      }
    }
  }

  return null
}

function extractKeymapTemplate (content) {
  const range = findKeymapBlockRange(content)
  if (!range) {
    return null
  }

  const { start, end } = range
  const lineStart = content.lastIndexOf('\n', start - 1) + 1
  const prefix = content.slice(lineStart, start)
  const effectiveStart = /^[ \t]*$/.test(prefix) ? lineStart : start

  return `${content.slice(0, effectiveStart)}{{rendered_keymap}}${content.slice(end)}`
}

function extractBlockWithIndex (content, startIndex) {
  let depth = 0
  for (let i = startIndex; i < content.length; i++) {
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
    return quoted[1]
  }

  const angleMatches = Array.from(trimmed.matchAll(/<([^>]+)>/g))
  if (angleMatches.length) {
    const values = angleMatches.map(match => normalizeAngleValue(match[1]))
    return values.length === 1 ? values[0] : values
  }

  return normalizeAngleValue(trimmed)
}

function parseProperties (content) {
  const properties = {}
  const pattern = /([A-Za-z0-9_-]+)\s*=\s*([^;]+);/g
  let match

  while ((match = pattern.exec(content)) !== null) {
    properties[match[1]] = parsePropertyValue(match[2])
  }

  return properties
}

function findBlocks (content) {
  const blocks = []
  const pattern = /([A-Za-z0-9_&\/-]+)\s*\{/g
  let match

  while ((match = pattern.exec(content)) !== null) {
    const name = match[1]
    const braceIndex = content.indexOf('{', match.index)
    const extracted = extractBlockWithIndex(content, braceIndex)
    if (!extracted) {
      break
    }

    blocks.push({ name, content: extracted.block, start: match.index, end: extracted.end })
    pattern.lastIndex = extracted.end + 1
  }

  return blocks
}

function stripBlocks (content, blocks) {
  let result = content
  const sorted = [...blocks].sort((a, b) => b.start - a.start)
  for (const block of sorted) {
    result = result.slice(0, block.start) + ' ' + result.slice(block.end + 1)
  }
  return result
}

function parseNode (content) {
  const blocks = findBlocks(content)
  const children = {}
  const order = []

  for (const block of blocks) {
    children[block.name] = parseNode(block.content)
    order.push(block.name)
  }

  const properties = parseProperties(stripBlocks(content, blocks))
  return { properties, children, order }
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
  for (const block of blocks) {
    nodes[block.name] = parseNode(block.content)
    order.push(block.name)
  }

  return { includes, nodes, order }
}

function normalizeSensorBindings(sensorBindings, sensorCount) {
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

function parseKeymapCode (content, options = {}) {
  const dts = parseDts(content)
  const keymapNode = dts.nodes['/']?.children?.keymap
  const extracted = extractKeymapLayers(keymapNode, options)
  if (!extracted) {
    return null
  }

  const template = extractKeymapTemplate(content)
  const parsed = Object.assign({}, KEYMAP_ROOT, {
    layer_names: extracted.layerNames,
    layers: extracted.layers,
    sensor_layers: extracted.sensorLayers && extracted.sensorLayers.length
      ? extracted.sensorLayers
      : undefined
  })

  if (template) {
    parsed[EDITOR_METADATA_KEY] = { template, source: 'code' }
  }

  return parsed
}

module.exports = {
  parseKeymapCode
}
