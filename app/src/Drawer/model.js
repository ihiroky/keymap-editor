import keyBy from 'lodash/keyBy'

import { getKeyBoundingBox, getKeyStyles } from '../key-units'
import {
  buildAvailableBindingSet,
  collectComboReferenceIssues,
  getNodeBind,
  getUnresolvedBindingCode,
  isComboVisibleOnLayer as isComboVisibleOnLayerShared,
  normalizeBindingText as normalizeBindingTextShared,
  normalizeComboLayers as normalizeComboLayersShared,
  normalizeComboPositions as normalizeComboPositionsShared,
  splitBindingList as splitBindingListShared
} from '../shared/keymap-reference-errors'

const DIRECT_LAYER_BEHAVIOURS = new Set(['&mo', '&to', '&tog', '&sl', '&lt'])
const LAYER_LINK_BEHAVIOURS = new Set(['&mo', '&to', '&tog', '&sl', '&lt'])
const MAX_RENDER_LABEL_LENGTH = 18
const LAYOUT_PADDING = 28
const COMBO_KEY_ENDPOINT_Y_OFFSET = 10

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function truncateLabel(value) {
  const text = String(value || '').trim()
  if (!text) {
    return ''
  }

  if (text.length <= MAX_RENDER_LABEL_LENGTH) {
    return text
  }

  return `${text.slice(0, MAX_RENDER_LABEL_LENGTH - 3)}...`
}

function renderParamNode(node) {
  if (!node || typeof node !== 'object') {
    return String(node || '')
  }

  const value = String(node.value || '')
  const params = Array.isArray(node.params)
    ? node.params.map(renderParamNode).filter(Boolean)
    : []

  if (!params.length) {
    return value
  }

  return `${value}(${params.join(',')})`
}

function normalizeBindingText(binding) {
  const normalized = normalizeBindingTextShared(binding)
  if (normalized) {
    return normalized
  }

  if (binding && typeof binding === 'object' && typeof binding.value === 'string') {
    const params = Array.isArray(binding.params)
      ? binding.params.map(renderParamNode).filter(Boolean)
      : []

    return `${binding.value} ${params.join(' ')}`.trim() || '&none'
  }

  return '&none'
}

function parseBindingText(binding) {
  const text = normalizeBindingText(binding)
  const [code = '', ...params] = text.split(/\s+/).filter(Boolean)

  return { code, params }
}

function splitBindingList(rawBindings) {
  return splitBindingListShared(rawBindings)
}

function buildLayerMoveContext(keymap, behaviourTypes) {
  const behaviorByBind = {}
  const definitionGroups = [
    ...(Array.isArray(keymap?.behavior_overrides) ? keymap.behavior_overrides : []),
    ...(Array.isArray(keymap?.behavior_definitions) ? keymap.behavior_definitions : [])
  ]

  for (const definition of definitionGroups) {
    const bind = getNodeBind(definition)
    if (bind && !behaviorByBind[bind]) {
      behaviorByBind[bind] = definition
    }
  }

  return {
    behaviorByBind,
    behaviourTypeByCompatible: keyBy(behaviourTypes || [], 'compatible')
  }
}

function parseLayerIndex(value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null
  }

  return parsed
}

function resolveDirectLayerMove(code, params, fallbackParams) {
  if (!DIRECT_LAYER_BEHAVIOURS.has(code)) {
    return null
  }

  const layerValue = params[0] !== undefined ? params[0] : fallbackParams[0]
  const targetLayer = parseLayerIndex(layerValue)

  if (targetLayer === null) {
    return null
  }

  return {
    trigger: code,
    targetLayer
  }
}

function getNodeBindings(node) {
  if (!node || typeof node !== 'object') {
    return []
  }

  return splitBindingList(node?.properties?.bindings)
}

function resolveLayerMoveFromParts(code, params, context, options = {}) {
  const fallbackParams = Array.isArray(options.fallbackParams) ? options.fallbackParams : []
  const visited = options.visited || new Set()

  const direct = resolveDirectLayerMove(code, params, fallbackParams)
  if (direct) {
    return direct
  }

  if (!code || visited.has(code)) {
    return null
  }

  const node = context.behaviorByBind[code]
  if (!node) {
    return null
  }

  const compatible = node?.properties?.compatible || node?.compatible || ''
  const behaviourType = context.behaviourTypeByCompatible[compatible]

  if (Array.isArray(behaviourType?.overrideBinds)) {
    for (const overrideBind of behaviourType.overrideBinds) {
      const resolved = resolveDirectLayerMove(overrideBind, params, params)
      if (resolved) {
        return resolved
      }
    }
  }

  const nextVisited = new Set(visited)
  nextVisited.add(code)

  const bindings = getNodeBindings(node)
  for (const nestedBinding of bindings) {
    const parsedNested = parseBindingText(nestedBinding)
    const resolved = resolveLayerMoveFromParts(
      parsedNested.code,
      parsedNested.params,
      context,
      {
        fallbackParams: params,
        visited: nextVisited
      }
    )

    if (resolved) {
      return resolved
    }
  }

  return null
}

function resolveLayerMove(binding, keymap, behaviourTypes) {
  const parsed = parseBindingText(binding)
  if (!parsed.code.startsWith('&')) {
    return null
  }

  const context = buildLayerMoveContext(keymap, behaviourTypes)
  const resolved = resolveLayerMoveFromParts(parsed.code, parsed.params, context, {
    fallbackParams: parsed.params
  })

  if (!resolved || !LAYER_LINK_BEHAVIOURS.has(resolved.trigger)) {
    return null
  }

  return resolved
}

function normalizeComboLayers(combo) {
  return normalizeComboLayersShared(combo)
}

function isComboVisibleOnLayer(combo, layerIndex) {
  return isComboVisibleOnLayerShared(combo, layerIndex)
}

function keycodeDisplayValue(keycodeToken, keycodeByCode) {
  const token = String(keycodeToken || '').trim()
  if (!token) {
    return ''
  }

  const keycode = keycodeByCode[token]
  if (!keycode) {
    return token
  }

  return keycode.symbol || keycode.code || token
}

function formatBindingDisplay(binding, keycodes, behaviours, splitFallbackBehavior = false) {
  const { code, params } = parseBindingText(binding)
  const keycodeByCode = keyBy(keycodes || [], 'code')
  const behaviourByCode = keyBy(behaviours || [], 'code')

  if (!code) {
    return { tapLabel: '', behaviorLabel: null }
  }

  if (code === '&trans') {
    return { tapLabel: '▽', behaviorLabel: null }
  }

  if (code === '&none') {
    return { tapLabel: 'none', behaviorLabel: null }
  }

  if (code === '&kp') {
    return {
      tapLabel: truncateLabel(keycodeDisplayValue(params[0], keycodeByCode) || 'KP'),
      behaviorLabel: null
    }
  }

  if (code === '&lt') {
    const tapValue = keycodeDisplayValue(params[1], keycodeByCode)
    if (tapValue) {
      return { tapLabel: truncateLabel(tapValue), behaviorLabel: null }
    }
  }

  const firstKnownKeycode = params.find(value => keycodeByCode[value])
  if (firstKnownKeycode) {
    return {
      tapLabel: truncateLabel(keycodeDisplayValue(firstKnownKeycode, keycodeByCode)),
      behaviorLabel: null
    }
  }

  const behaviour = behaviourByCode[code]
  if (splitFallbackBehavior && !params.length) {
    return {
      tapLabel: '',
      behaviorLabel: truncateLabel(code.replace(/^&/, ''))
    }
  }

  if (behaviour && !params.length) {
    return {
      tapLabel: truncateLabel(behaviour.name || code.replace(/^&/, '')),
      behaviorLabel: null
    }
  }

  if (!params.length) {
    return { tapLabel: truncateLabel(code.replace(/^&/, '')), behaviorLabel: null }
  }

  if (splitFallbackBehavior) {
    return {
      tapLabel: truncateLabel(params.join(' ')),
      behaviorLabel: truncateLabel(code.replace(/^&/, ''))
    }
  }

  return {
    tapLabel: truncateLabel(`${code.replace(/^&/, '')} ${params.join(' ')}`),
    behaviorLabel: null
  }
}

function formatBindingLabel(binding, keycodes, behaviours) {
  return formatBindingDisplay(binding, keycodes, behaviours, false).tapLabel
}

function formatKeyBindingDisplay(binding, keycodes, behaviours) {
  return formatBindingDisplay(binding, keycodes, behaviours, true)
}

function offsetCssPixelValue(pixelText, delta) {
  const numeric = Number(String(pixelText || '').replace(/px$/, ''))
  if (!Number.isFinite(numeric)) {
    return pixelText
  }

  return `${numeric + delta}px`
}

function buildLayoutGeometry(layout) {
  if (!Array.isArray(layout) || layout.length === 0) {
    return {
      width: 0,
      height: 0,
      keyStyles: {},
      keyCenters: {}
    }
  }

  const keyShapes = layout.map((key, index) => {
    const position = {
      x: Number(key?.x || 0),
      y: Number(key?.y || 0)
    }
    const size = {
      u: Number(key?.u || key?.w || 1),
      h: Number(key?.h || 1)
    }
    const rotation = {
      x: key?.rx,
      y: key?.ry,
      a: key?.r
    }
    const bounds = getKeyBoundingBox(position, size, rotation)
    const style = getKeyStyles(position, size, rotation)

    return {
      index,
      bounds,
      style
    }
  })

  const minX = keyShapes.reduce((value, key) => Math.min(value, key.bounds.min.x), keyShapes[0].bounds.min.x)
  const minY = keyShapes.reduce((value, key) => Math.min(value, key.bounds.min.y), keyShapes[0].bounds.min.y)
  const maxX = keyShapes.reduce((value, key) => Math.max(value, key.bounds.max.x), keyShapes[0].bounds.max.x)
  const maxY = keyShapes.reduce((value, key) => Math.max(value, key.bounds.max.y), keyShapes[0].bounds.max.y)

  const offsetX = LAYOUT_PADDING - minX
  const offsetY = LAYOUT_PADDING - minY

  const keyStyles = {}
  const keyCenters = {}

  for (const shape of keyShapes) {
    keyStyles[shape.index] = {
      ...shape.style,
      left: offsetCssPixelValue(shape.style.left, offsetX),
      top: offsetCssPixelValue(shape.style.top, offsetY)
    }

    keyCenters[shape.index] = {
      x: (shape.bounds.min.x + shape.bounds.max.x) / 2 + offsetX,
      y: (shape.bounds.min.y + shape.bounds.max.y) / 2 + offsetY
    }
  }

  return {
    width: Math.ceil(maxX - minX + LAYOUT_PADDING * 2),
    height: Math.ceil(maxY - minY + LAYOUT_PADDING * 2),
    keyStyles,
    keyCenters
  }
}

function getLayerBindings(keymap, layerIndex) {
  if (!Array.isArray(keymap?.layers)) {
    return []
  }

  return Array.isArray(keymap.layers[layerIndex])
    ? keymap.layers[layerIndex]
    : []
}

function getComboBindingLabel(combo, keycodes, behaviours) {
  const bindings = splitBindingList(combo?.properties?.bindings)
  const binding = bindings[0] || '&none'

  return formatBindingLabel(binding, keycodes, behaviours)
}

function getComboBindingTitle(combo) {
  const bindings = splitBindingList(combo?.properties?.bindings)
  return normalizeBindingText(bindings[0] || '&none')
}

function normalizeComboPositions(combo, keyCount) {
  return normalizeComboPositionsShared(combo, keyCount)
}

function buildComboRenderModels({
  keymap,
  layerIndex,
  layout,
  geometry,
  keycodes,
  behaviours,
  comboMessagesByIndex
}) {
  const combos = Array.isArray(keymap?.combos) ? keymap.combos : []
  const positionedCombos = []
  const xBucketStack = new Map()

  combos.forEach((combo, comboIndex) => {
    if (!isComboVisibleOnLayer(combo, layerIndex)) {
      return
    }

    const positions = normalizeComboPositions(combo, layout.length)
    if (positions.length < 2) {
      return
    }

    const centers = positions
      .map(position => geometry.keyCenters[position])
      .filter(Boolean)

    if (centers.length < 2) {
      return
    }

    const label = getComboBindingLabel(combo, keycodes, behaviours) || 'Combo'
    const title = getComboBindingTitle(combo)
    const meanX = centers.reduce((sum, center) => sum + center.x, 0) / centers.length
    const minY = centers.reduce((value, center) => Math.min(value, center.y), centers[0].y)
    const bucket = Math.round(meanX / 80)
    const bucketOffset = xBucketStack.get(bucket) || 0
    xBucketStack.set(bucket, bucketOffset + 1)

    const width = clamp(36 + label.length * 6, 40, 140)
    const height = 24
    const left = clamp(meanX - width / 2, 6, Math.max(6, geometry.width - width - 6))
    const top = Math.max(6, minY - 42 - bucketOffset * 28)
    const centerX = left + width / 2
    const centerY = top + height

    const connectors = centers.map((center, lineIndex) => ({
      id: `combo-line-${layerIndex}-${comboIndex}-${lineIndex}`,
      x1: centerX,
      y1: centerY,
      x2: center.x,
      y2: Math.max(0, center.y - COMBO_KEY_ENDPOINT_Y_OFFSET)
    }))

    positionedCombos.push({
      id: `combo-${layerIndex}-${comboIndex}`,
      label,
      title,
      hasError: comboMessagesByIndex.has(comboIndex),
      errorMessage: comboMessagesByIndex.get(comboIndex) || null,
      left,
      top,
      width,
      height,
      connectors
    })
  })

  return positionedCombos
}

function buildLayerRenderModel({
  layout,
  keymap,
  layerIndex,
  keycodes,
  behaviours,
  behaviourTypes,
  geometry
}) {
  const computedGeometry = geometry || buildLayoutGeometry(layout)
  const layerBindings = getLayerBindings(keymap, layerIndex)
  const layerNames = Array.isArray(keymap?.layer_names) ? keymap.layer_names : []
  const layerName = String(layerNames[layerIndex] || `Layer ${layerIndex}`)
  const availableBindings = buildAvailableBindingSet({ behaviours, keymap })
  const comboReferenceIssues = collectComboReferenceIssues({
    keymap,
    layerIndex,
    keyCount: Array.isArray(layout) ? layout.length : 0,
    availableBindings
  })

  const keys = (Array.isArray(layout) ? layout : []).map((key, keyIndex) => {
    const normalizedBinding = normalizeBindingText(layerBindings[keyIndex])
    const layerMove = resolveLayerMove(normalizedBinding, keymap, behaviourTypes)
    const display = formatKeyBindingDisplay(normalizedBinding, keycodes, behaviours)
    const targetLayerName = layerMove
      ? String(layerNames[layerMove.targetLayer] || layerMove.targetLayer)
      : null
    const unresolvedBindingCode = getUnresolvedBindingCode(normalizedBinding, availableBindings)
    const comboMessages = comboReferenceIssues.keyMessagesByIndex.get(keyIndex) || []
    const errorMessages = []

    if (unresolvedBindingCode) {
      errorMessages.push(`Unresolved binding: ${unresolvedBindingCode}`)
    }

    errorMessages.push(...comboMessages)

    return {
      id: `layer-${layerIndex}-key-${keyIndex}`,
      index: keyIndex,
      binding: normalizedBinding,
      tapLabel: display.tapLabel,
      behaviorLabel: display.behaviorLabel,
      hasError: errorMessages.length > 0,
      errorMessage: errorMessages.length > 0 ? errorMessages.join('\n') : null,
      style: computedGeometry.keyStyles[keyIndex] || {},
      layerMove: layerMove
        ? {
          ...layerMove,
          label: targetLayerName,
          href: `#drawer-layer-${layerMove.targetLayer}`
        }
        : null
    }
  })

  const combos = buildComboRenderModels({
    keymap,
    layerIndex,
    layout,
    geometry: computedGeometry,
    keycodes,
    behaviours,
    comboMessagesByIndex: comboReferenceIssues.comboMessagesByIndex
  })

  return {
    id: `drawer-layer-${layerIndex}`,
    index: layerIndex,
    name: layerName,
    width: computedGeometry.width,
    height: computedGeometry.height,
    keys,
    combos
  }
}

function buildDrawerRenderModels({
  layout,
  keymap,
  keycodes,
  behaviours,
  behaviourTypes
}) {
  const layers = Array.isArray(keymap?.layers) ? keymap.layers : []
  const geometry = buildLayoutGeometry(layout)

  return layers.map((_, layerIndex) => (
    buildLayerRenderModel({
      layout,
      keymap,
      layerIndex,
      keycodes,
      behaviours,
      behaviourTypes,
      geometry
    })
  ))
}

export {
  normalizeComboLayers,
  isComboVisibleOnLayer,
  resolveLayerMove,
  formatBindingLabel,
  formatKeyBindingDisplay,
  buildLayerRenderModel,
  buildDrawerRenderModels,
  normalizeBindingText
}
