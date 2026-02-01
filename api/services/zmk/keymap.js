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

class KeymapValidationError extends Error {
  constructor (errors) {
    super()
    this.name = 'KeymapValidationError'
    this.errors = errors
  }
}

const behaviours = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/zmk-behaviors.json')))
const behavioursByBind = keyBy(behaviours, 'code')

function encodeBindValue
(parsed) {
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

function generateKeymap (layout, keymap, template) {
  const encoded = encodeKeymap(keymap)
  return {
    code: generateKeymapCode(layout, keymap, encoded, template || defaults.keymapTemplate),
    json: generateKeymapJSON(layout, keymap, encoded)
  }
}

function renderTemplate (template, params) {
  const includesPattern = /\{\{\s*behaviour_includes\s*\}\}/
  const layersPattern = /\{\{\s*rendered_layers\s*\}\}/

  const renderedLayers = params.layers.map((layer, i) => {
    const name = i === 0 ? 'default_layer' : `layer_${params.layerNames[i] || i}`
    const rendered = renderTable(params.layout, layer, {
      linePrefix: '',
      columnSeparator: ' '
    })
    const sensorLayer = params.sensorLayers?.[i]
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
  })

  return template
    .replace(includesPattern, params.behaviourHeaders.join('\n'))
    .replace(layersPattern, renderedLayers.join(''))
}

function generateKeymapCode (layout, keymap, encoded, template) {
  const { layer_names: names = [] } = keymap
  const behaviourHeaders = flatten(getBehavioursUsed(keymap).map(
    bind => get(behavioursByBind, [bind, 'includes'], [])
  ))

  return renderTemplate(template, {
    layout,
    behaviourHeaders,
    layers: encoded.layers,
    layerNames: names,
    sensorLayers: encoded.sensor_layers
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
