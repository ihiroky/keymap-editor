const fs = require('fs')
const path = require('path')
const filter = require('lodash/filter')
const flatten = require('lodash/flatten')
const get = require('lodash/get')
const keyBy = require('lodash/keyBy')
const map = require('lodash/map')
const uniq = require('lodash/uniq')

const { renderTable } = require('./layout')
const defaults = require('./defaults')

const EDITOR_METADATA_KEY = '__keymap_editor'

class KeymapValidationError extends Error {
  constructor (errors) {
    super()
    this.name = 'KeymapValidationError'
    this.errors = errors
  }
}

const behaviours = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/zmk-behaviors.json')))
const behavioursByBind = keyBy(behaviours, 'code')

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

/**
 * Parse a bind string into a tree of values and parameters
 * @param {String} binding
 * @returns {Object}
 */
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

{{rendered_layers}}    };
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
    const name = i === 0 ? 'default_layer' : `layer_${params.layerNames[i] || i}`
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
        ${name.replace(/[^a-zA-Z0-9_]/g, '_')} {
            bindings = <
${rendered}
            >;
${renderedSensors}        };
`
  }).join('')
}

function renderTemplate (template, params) {
  const includesPattern = /\{\{\s*behaviour_includes\s*\}\}/
  const layersPattern = /\{\{\s*rendered_layers\s*\}\}/
  const keymapPattern = /\{\{\s*rendered_keymap\s*\}\}/

  const renderedLayers = renderLayers(params)
  const { block: includeBlock, withoutIncludes } = normalizeIncludes(template, params.behaviourHeaders)
  let output = withoutIncludes

  if (includesPattern.test(output)) {
    output = output.replace(includesPattern, includeBlock)
  } else {
    output = insertIncludes(output, includeBlock)
  }

  if (keymapPattern.test(output)) {
    const renderedKeymap = KEYMAP_BLOCK_TEMPLATE.replace(layersPattern, renderedLayers)
    output = output.replace(keymapPattern, renderedKeymap)
  }

  if (layersPattern.test(output)) {
    output = output.replace(layersPattern, renderedLayers)
  }

  return output
}

function generateKeymapCode (layout, keymap, encoded, template, options = {}) {
  const { layer_names: names = [] } = keymap
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

  return renderTemplate(template, {
    layout,
    behaviourHeaders,
    layers: encoded.layers,
    layerNames: names,
    sensorLayers: encoded.sensor_layers,
    sensors: options.sensors
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

function validateKeymapJson (keymap) {
  const errors = []

  if (typeof keymap !== 'object' || keymap === null) {
    errors.push('keymap.json root must be an object')
  } else if (!Array.isArray(keymap.layers)) {
    errors.push('keymap must include "layers" array')
  } else {
    for (const i in keymap.layers) {
      const layer = keymap.layers[i]

      if (!Array.isArray(layer)) {
        errors.push(`Layer at layers[${i}] must be an array`)
      } else {
        for (const j in layer) {
          const key = layer[j]
          const keyPath = `layers[${i}][${j}]`

          if (typeof key !== 'string') {
            errors.push(`Value at "${keyPath}" must be a string`)
          } else {
            const bind = key.match(/^&.+?\b/)
            console.log('bind', JSON.stringify(bind), keyPath)
            if (!(bind && bind[0] in behavioursByBind)) {
              errors.push(`Key bind at "${keyPath}" has invalid behaviour`)
            }
          }

          // TODO: validate remaining bind parameters
        }
      }
    }
  }

  if (errors.length) {
    throw new KeymapValidationError(errors)
  }
}

module.exports = {
  KeymapValidationError,
  encodeKeymap,
  parseKeymap,
  generateKeymap,
  validateKeymapJson
}
