import filter from 'lodash/filter'
import flatten from 'lodash/flatten'
import get from 'lodash/get'
import isEqual from 'lodash/isEqual'
import keyBy from 'lodash/keyBy'
import map from 'lodash/map'
import uniq from 'lodash/uniq'

import { renderTable } from './layout'
import { isMacroCompatible } from './macro-helpers'
import { collectEditableRanges, parseKeymapCode } from './keymap-code'
import { keymapTemplate } from './defaults'

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

function getBehaviourBindCode (binding) {
  const text = String(binding || '').trim()
  if (!text.startsWith('&')) {
    return ''
  }

  const [code] = text.split(/\s+/)
  return code || ''
}

function getComboBehavioursUsed (keymap) {
  const combos = normalizeBehaviorList(keymap?.combos)
  const binds = []

  for (const combo of combos) {
    const bindings = Array.isArray(combo?.properties?.bindings)
      ? combo.properties.bindings
      : []
    for (const binding of bindings) {
      const code = getBehaviourBindCode(binding)
      if (code) {
        binds.push(code)
      }
    }
  }

  return uniq(binds)
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

function getLineIndent (content, index) {
  const lineStart = content.lastIndexOf('\n', Math.max(index - 1, 0)) + 1
  const prefix = content.slice(lineStart, index)
  const match = prefix.match(/^[ \t]*/)
  return match ? match[0] : ''
}

function applyTextReplacements (content, replacements) {
  const sorted = [...replacements]
    .filter(item => Number.isInteger(item.start) && Number.isInteger(item.end) && item.end >= item.start)
    .sort((a, b) => b.start - a.start)

  let output = content
  let previousStart = content.length + 1

  for (const replacement of sorted) {
    if (replacement.end > previousStart) {
      return null
    }

    output = output.slice(0, replacement.start) + replacement.replacement + output.slice(replacement.end)
    previousStart = replacement.start
  }

  return output
}

function findChildNodeByName (node, name) {
  if (!node || !Array.isArray(node.children)) {
    return null
  }

  return node.children.find(child => child.name === name) || null
}

function collectOrderedPropertyKeys (properties, propertyOrder) {
  const objectProperties = properties && typeof properties === 'object' ? properties : {}
  const ordered = Array.isArray(propertyOrder)
    ? propertyOrder.filter(key => typeof key === 'string')
    : []
  return [
    ...ordered,
    ...Object.keys(objectProperties).filter(key => !ordered.includes(key))
  ]
}

function getIndentLevel (content, index) {
  const indent = getLineIndent(content, index)
  if (!indent) {
    return 0
  }

  if (indent.includes('\t')) {
    return indent.split('\t').length - 1
  }

  return Math.max(0, Math.floor(indent.length / 4))
}

function normalizeBindingList (bindings) {
  if (!Array.isArray(bindings)) {
    return []
  }

  return bindings.map(value => String(value))
}

function normalizeSensorBindingLayer (sensorLayer, sensors) {
  const filtered = filterEditableSensorBindings(sensorLayer, sensors)
  return Array.isArray(filtered)
    ? filtered.map(value => String(value))
    : []
}

function toComparableBehaviorNode (node) {
  if (!node || typeof node !== 'object') {
    return null
  }

  return {
    label: node.label || null,
    name: node.name || '',
    properties: node.properties || {},
    property_types: node.property_types || {},
    property_order: Array.isArray(node.property_order) ? node.property_order : [],
    children: Array.isArray(node.children)
      ? node.children.map(toComparableBehaviorNode)
      : []
  }
}

function areBehaviorNodesEquivalent (sourceNode, targetNode) {
  return isEqual(
    toComparableBehaviorNode(sourceNode),
    toComparableBehaviorNode(targetNode)
  )
}

function renderLayerBlock (layout, layerName, layerBindings, sensorLayer, indent) {
  const rendered = renderTable(layout, layerBindings, {
    linePrefix: '',
    columnSeparator: ' ',
    align: 'left'
  })
  const renderedSensors = Array.isArray(sensorLayer) && sensorLayer.length > 0
    ? `${indent}    sensor-bindings = <${sensorLayer.join(' ')}>;\n`
    : ''

  return `${indent}${layerName} {\n` +
    `${indent}    bindings = <\n` +
    `${rendered}\n` +
    `${indent}    >;\n` +
    `${renderedSensors}` +
    `${indent}};\n`
}

function renderLayerBindingsPatchValue (layout, bindings, indent) {
  const rendered = renderTable(layout, bindings, {
    linePrefix: '',
    columnSeparator: ' ',
    align: 'left'
  })

  return `<\n${rendered}\n${indent}>`
}

function planBehaviorNodeValueReplacements (sourceNode, targetNode, behaviourTypeByCompatible, replacements) {
  const local = []
  const planned = planBehaviorNodeReplacements(sourceNode, targetNode, behaviourTypeByCompatible, local)
  if (!planned) {
    return false
  }

  replacements.push(...local)
  return true
}

function planBehaviorNodeReplacements (sourceNode, targetNode, behaviourTypeByCompatible, replacements) {
  if (!sourceNode || !targetNode) {
    return false
  }

  if (sourceNode.name !== targetNode.name || sourceNode.label !== targetNode.label) {
    return false
  }

  const compatible = targetNode.properties?.compatible || targetNode.compatible
  const knownTypes = compatible
    ? behaviourTypeByCompatible[compatible]?.propertyTypes || {}
    : {}
  const explicitTypes = targetNode.property_types || {}
  const targetProperties = targetNode.properties || {}
  const targetKeys = collectOrderedPropertyKeys(targetProperties, targetNode.property_order)
  const sourceKeys = Array.isArray(sourceNode.propertyOrder) ? sourceNode.propertyOrder : []

  if (targetKeys.length !== sourceKeys.length) {
    return false
  }

  for (let i = 0; i < sourceKeys.length; i += 1) {
    if (sourceKeys[i] !== targetKeys[i]) {
      return false
    }
  }

  for (const key of sourceKeys) {
    const sourceProperty = sourceNode.properties?.[key]
    if (!sourceProperty) {
      return false
    }

    const value = targetProperties[key]
    const type = explicitTypes[key] || knownTypes[key]
    const isBooleanProperty = sourceProperty.type === 'boolean' || type === 'boolean' || typeof value === 'boolean'

    if (isBooleanProperty) {
      if (sourceProperty.type !== 'boolean' || value !== true) {
        return false
      }
      continue
    }

    if (sourceProperty.type !== 'assignment') {
      return false
    }

    const renderedValue = renderPropertyValue(value, type)
    replacements.push({
      start: sourceProperty.valueStart,
      end: sourceProperty.valueEnd,
      replacement: renderedValue
    })
  }

  const sourceChildren = Array.isArray(sourceNode.children) ? sourceNode.children : []
  const targetChildren = Array.isArray(targetNode.children) ? targetNode.children : []
  if (sourceChildren.length !== targetChildren.length) {
    return false
  }

  for (let i = 0; i < sourceChildren.length; i += 1) {
    const planned = planBehaviorNodeReplacements(
      sourceChildren[i],
      targetChildren[i],
      behaviourTypeByCompatible,
      replacements
    )
    if (!planned) {
      return false
    }
  }

  return true
}

function collectNodeRange (nodes) {
  const normalized = Array.isArray(nodes) ? nodes : []
  if (!normalized.length) {
    return null
  }

  let start = normalized[0].start
  let end = normalized[0].end
  for (const node of normalized) {
    start = Math.min(start, node.start)
    end = Math.max(end, node.end)
  }

  return { start, end }
}

function replaceBehaviorSectionLocally (sectionNodes, targetNodes, behaviourTypeByCompatible, replacements, insertAt) {
  const rendered = renderBehaviorOverrides(targetNodes, behaviourTypeByCompatible)
  const range = collectNodeRange(sectionNodes)
  if (range) {
    replacements.push({ start: range.start, end: range.end, replacement: rendered })
    return true
  }

  if (rendered && Number.isInteger(insertAt)) {
    replacements.push({ start: insertAt, end: insertAt, replacement: `${rendered}\n` })
    return true
  }

  return false
}

function planBehaviorNodeUpdates (params) {
  const {
    sourceCode,
    sourceRangeNodes,
    sourceParsedNodes,
    targetNodes,
    behaviourTypeByCompatible,
    replacements
  } = params

  if (sourceRangeNodes.length !== sourceParsedNodes.length || sourceParsedNodes.length !== targetNodes.length) {
    return false
  }

  for (let index = 0; index < targetNodes.length; index += 1) {
    const sourceRangeNode = sourceRangeNodes[index]
    const sourceParsedNode = sourceParsedNodes[index]
    const targetNode = targetNodes[index]
    if (!sourceRangeNode || !sourceParsedNode || !targetNode) {
      return false
    }

    const sourceLabel = sourceRangeNode.label || null
    const targetLabel = targetNode.label || null
    if (
      sourceRangeNode.name !== targetNode.name ||
      sourceLabel !== targetLabel ||
      sourceParsedNode.name !== targetNode.name ||
      (sourceParsedNode.label || null) !== targetLabel
    ) {
      return false
    }

    if (areBehaviorNodesEquivalent(sourceParsedNode, targetNode)) {
      continue
    }

    if (planBehaviorNodeValueReplacements(sourceRangeNode, targetNode, behaviourTypeByCompatible, replacements)) {
      continue
    }

    replacements.push({
      start: sourceRangeNode.start,
      end: sourceRangeNode.end,
      replacement: renderBehaviorNode(
        targetNode,
        getIndentLevel(sourceCode, sourceRangeNode.start),
        behaviourTypeByCompatible
      )
    })
  }

  return true
}

function renderFullKeymapBlock (layout, keymap, encoded, sensors) {
  const layerNames = Array.isArray(keymap.layer_names) ? keymap.layer_names : []
  const renderedLayers = encoded.layers.map((layer, index) => {
    const name = String(layerNames[index] ?? index)
    const sensorLayer = filterEditableSensorBindings(
      encoded.sensor_layers?.[index],
      sensors
    )
    return `\n${renderLayerBlock(layout, name, layer, sensorLayer, '        ')}`
  }).join('')

  return `    keymap {\n` +
    '        compatible = "zmk,keymap";\n' +
    `${renderedLayers}\n` +
    '    };\n'
}

function tryGenerateKeymapCodeWithRangePatch (layout, originalKeymap, keymap, encoded, options = {}) {
  const sourceCode = originalKeymap?.[EDITOR_METADATA_KEY]?.source_code
  if (typeof sourceCode !== 'string' || !sourceCode.trim()) {
    return null
  }

  const ranges = collectEditableRanges(sourceCode)
  const rootNode = ranges?.root
  if (!rootNode) {
    return null
  }

  const sensorCount = Array.isArray(options.sensors) ? options.sensors.length : undefined
  const sourceParsedCode = parseKeymapCode(
    sourceCode,
    Number.isInteger(sensorCount) ? { sensorCount } : {}
  )
  if (!sourceParsedCode) {
    return null
  }

  const sourceKeymap = stripEditorMetadata(parseKeymap(sourceParsedCode))
  const sourceEncoded = encodeKeymap(sourceKeymap)
  const sourceCombos = normalizeBehaviorList(sourceKeymap.combos)
  const sourceBehaviorOverrides = normalizeBehaviorList(sourceKeymap.behavior_overrides)
  const sourceBehaviorDefinitions = normalizeBehaviorList(sourceKeymap.behavior_definitions)
  const sourceSplitDefinitions = splitMacroAndBehaviorDefinitions(sourceBehaviorDefinitions)

  const combos = normalizeBehaviorList(keymap.combos)
  const behaviorOverrides = normalizeBehaviorList(keymap.behavior_overrides)
  const behaviorDefinitions = normalizeBehaviorList(keymap.behavior_definitions)
  const behaviourTypeByCompatible = keyBy(options.behaviourTypes || [], 'compatible')
  const replacements = []

  const keymapNode = findChildNodeByName(rootNode, 'keymap')
  if (!keymapNode) {
    return null
  }

  const layerNodes = Array.isArray(keymapNode.children) ? keymapNode.children : []
  const layerNames = Array.isArray(keymap.layer_names) ? keymap.layer_names : []
  const sourceLayerNames = Array.isArray(sourceKeymap.layer_names) ? sourceKeymap.layer_names : []
  const layerShapeMatches = (
    layerNodes.length === encoded.layers.length &&
    sourceLayerNames.length === layerNodes.length &&
    layerNames.length === encoded.layers.length
  )

  if (!layerShapeMatches) {
    replacements.push({
      start: keymapNode.start,
      end: keymapNode.end,
      replacement: renderFullKeymapBlock(layout, keymap, encoded, options.sensors)
    })
  } else {
    for (let index = 0; index < layerNodes.length; index += 1) {
      const sourceLayer = layerNodes[index]
      const targetLayerName = String(layerNames[index])
      const sourceLayerName = String(sourceLayerNames[index])
      if (sourceLayer.name !== targetLayerName || sourceLayer.name !== sourceLayerName) {
        replacements.push({
          start: keymapNode.start,
          end: keymapNode.end,
          replacement: renderFullKeymapBlock(layout, keymap, encoded, options.sensors)
        })
        break
      }

      const sourceBindings = normalizeBindingList(sourceEncoded.layers?.[index])
      const targetBindings = normalizeBindingList(encoded.layers?.[index])
      const sourceSensors = normalizeSensorBindingLayer(sourceEncoded.sensor_layers?.[index], options.sensors)
      const targetSensors = normalizeSensorBindingLayer(encoded.sensor_layers?.[index], options.sensors)
      if (isEqual(sourceBindings, targetBindings) && isEqual(sourceSensors, targetSensors)) {
        continue
      }

      const localReplacements = []
      let patchable = true
      const bindingProperty = sourceLayer.properties?.bindings
      if (!bindingProperty || bindingProperty.type !== 'assignment') {
        patchable = false
      } else {
        localReplacements.push({
          start: bindingProperty.valueStart,
          end: bindingProperty.valueEnd,
          replacement: renderLayerBindingsPatchValue(
            layout,
            targetBindings,
            getLineIndent(sourceCode, bindingProperty.start)
          )
        })
      }

      const sensorProperty = sourceLayer.properties?.['sensor-bindings']
      const hasTargetSensors = targetSensors.length > 0
      const hasSourceSensors = sourceSensors.length > 0
      if (hasTargetSensors) {
        if (!sensorProperty || sensorProperty.type !== 'assignment') {
          patchable = false
        } else {
          localReplacements.push({
            start: sensorProperty.valueStart,
            end: sensorProperty.valueEnd,
            replacement: `<${targetSensors.join(' ')}>`
          })
        }
      } else if (hasSourceSensors && sensorProperty) {
        patchable = false
      }

      if (patchable) {
        replacements.push(...localReplacements)
      } else {
        replacements.push({
          start: sourceLayer.start,
          end: sourceLayer.end,
          replacement: renderLayerBlock(
            layout,
            targetLayerName,
            targetBindings,
            targetSensors,
            getLineIndent(sourceCode, sourceLayer.start)
          )
        })
      }
    }
  }

  const sourceOverrideNodes = (ranges.blocks || []).filter(node => node.name.startsWith('&'))
  if (
    !planBehaviorNodeUpdates({
      sourceCode,
      sourceRangeNodes: sourceOverrideNodes,
      sourceParsedNodes: sourceBehaviorOverrides,
      targetNodes: behaviorOverrides,
      behaviourTypeByCompatible,
      replacements
    })
  ) {
    const replaced = replaceBehaviorSectionLocally(
      sourceOverrideNodes,
      behaviorOverrides,
      behaviourTypeByCompatible,
      replacements,
      rootNode.start
    )
    if (!replaced) {
      return null
    }
  }

  const splitDefinitions = splitMacroAndBehaviorDefinitions(behaviorDefinitions)
  const sourceCombosNode = findChildNodeByName(rootNode, 'combos')
  const sourceMacrosNode = findChildNodeByName(rootNode, 'macros')
  const sourceBehaviorsNode = findChildNodeByName(rootNode, 'behaviors')
  const comboTargets = combos
  const macroTargets = splitDefinitions.macroDefinitions
  const behaviorTargets = splitDefinitions.behaviorDefinitions
  const sectionInsertions = []

  if (!sourceCombosNode && sourceCombos.length > 0) {
    return null
  }
  if (!sourceMacrosNode && sourceSplitDefinitions.macroDefinitions.length > 0) {
    return null
  }
  if (!sourceBehaviorsNode && sourceSplitDefinitions.behaviorDefinitions.length > 0) {
    return null
  }

  if (!sourceCombosNode && comboTargets.length > 0) {
    sectionInsertions.push(renderComboDefinitions(comboTargets, behaviourTypeByCompatible))
  } else if (sourceCombosNode) {
    if (sourceCombos.length > 0 && comboTargets.length === 0) {
      replacements.push({ start: sourceCombosNode.start, end: sourceCombosNode.end, replacement: '' })
    } else if (
      sourceCombos.length !== comboTargets.length ||
      !planBehaviorNodeUpdates({
        sourceCode,
        sourceRangeNodes: sourceCombosNode.children || [],
        sourceParsedNodes: sourceCombos,
        targetNodes: comboTargets,
        behaviourTypeByCompatible,
        replacements
      })
    ) {
      replacements.push({
        start: sourceCombosNode.start,
        end: sourceCombosNode.end,
        replacement: renderComboDefinitions(comboTargets, behaviourTypeByCompatible)
      })
    }
  }

  if (!sourceMacrosNode && macroTargets.length > 0) {
    sectionInsertions.push(renderMacroDefinitions(macroTargets, behaviourTypeByCompatible))
  } else if (sourceMacrosNode) {
    const sourceMacros = sourceSplitDefinitions.macroDefinitions
    if (sourceMacros.length > 0 && macroTargets.length === 0) {
      replacements.push({ start: sourceMacrosNode.start, end: sourceMacrosNode.end, replacement: '' })
    } else if (
      sourceMacros.length !== macroTargets.length ||
      !planBehaviorNodeUpdates({
        sourceCode,
        sourceRangeNodes: sourceMacrosNode.children || [],
        sourceParsedNodes: sourceMacros,
        targetNodes: macroTargets,
        behaviourTypeByCompatible,
        replacements
      })
    ) {
      replacements.push({
        start: sourceMacrosNode.start,
        end: sourceMacrosNode.end,
        replacement: renderMacroDefinitions(macroTargets, behaviourTypeByCompatible)
      })
    }
  }

  if (!sourceBehaviorsNode && behaviorTargets.length > 0) {
    sectionInsertions.push(renderBehaviorDefinitions(behaviorTargets, behaviourTypeByCompatible))
  } else if (sourceBehaviorsNode) {
    const sourceBehaviors = sourceSplitDefinitions.behaviorDefinitions
    if (sourceBehaviors.length > 0 && behaviorTargets.length === 0) {
      replacements.push({ start: sourceBehaviorsNode.start, end: sourceBehaviorsNode.end, replacement: '' })
    } else if (
      sourceBehaviors.length !== behaviorTargets.length ||
      !planBehaviorNodeUpdates({
        sourceCode,
        sourceRangeNodes: sourceBehaviorsNode.children || [],
        sourceParsedNodes: sourceBehaviors,
        targetNodes: behaviorTargets,
        behaviourTypeByCompatible,
        replacements
      })
    ) {
      replacements.push({
        start: sourceBehaviorsNode.start,
        end: sourceBehaviorsNode.end,
        replacement: renderBehaviorDefinitions(behaviorTargets, behaviourTypeByCompatible)
      })
    }
  }

  if (sectionInsertions.length > 0) {
    replacements.push({
      start: keymapNode.start,
      end: keymapNode.start,
      replacement: sectionInsertions.join('')
    })
  }

  return applyTextReplacements(sourceCode, replacements)
}

function generateKeymap (layout, keymap, template, options = {}) {
  const editorTemplate = keymap?.[EDITOR_METADATA_KEY]?.template
  const sanitized = stripEditorMetadata(keymap)
  const encoded = encodeKeymap(sanitized)
  const templateToUse = template || editorTemplate || keymapTemplate
  const fullCode = generateKeymapCode(layout, sanitized, encoded, templateToUse, options)
  const shouldUseRangePatch = !template
  const patchedCode = shouldUseRangePatch
    ? tryGenerateKeymapCodeWithRangePatch(layout, keymap, sanitized, encoded, options)
    : null
  const sourceKeymap = patchedCode ? parseSourceKeymapFromMetadata(keymap, options) : null
  const includeSafe = patchedCode && sourceKeymap
    ? !hasMissingNewRequiredIncludes(
      keymap?.[EDITOR_METADATA_KEY]?.source_code,
      sourceKeymap,
      sanitized,
      options
    )
    : false

  return {
    code: includeSafe ? patchedCode : fullCode,
    json: generateKeymapJSON(layout, sanitized, encoded)
  }
}

function parseSourceKeymapFromMetadata (keymap, options = {}) {
  const sourceCode = keymap?.[EDITOR_METADATA_KEY]?.source_code
  if (typeof sourceCode !== 'string' || !sourceCode.trim()) {
    return null
  }

  const sensorCount = Array.isArray(options.sensors) ? options.sensors.length : undefined
  const parsedCode = parseKeymapCode(
    sourceCode,
    Number.isInteger(sensorCount) ? { sensorCount } : {}
  )
  if (!parsedCode) {
    return null
  }

  return stripEditorMetadata(parseKeymap(parsedCode))
}

function collectDynamicIncludeLinesForKeymap (keymap, options = {}) {
  const behavioursByBind = keyBy(options.behaviours || [], 'code')
  const behaviourTypeByCompatible = keyBy(options.behaviourTypes || [], 'compatible')
  const behaviorOverrides = normalizeBehaviorList(keymap?.behavior_overrides)
  const behaviorDefinitions = normalizeBehaviorList(keymap?.behavior_definitions)
  const keymapForIncludes = Array.isArray(keymap?.sensor_layers)
    ? Object.assign({}, keymap, {
      sensor_layers: keymap.sensor_layers.map(layer => (
        filterEditableSensorBindings(layer, options.sensors)
      ))
    })
    : keymap
  const behaviourHeaders = flatten(getBehavioursUsed(keymapForIncludes).map(
    bind => get(behavioursByBind, [bind, 'includes'], [])
  ))
  const comboHeaders = flatten(getComboBehavioursUsed(keymapForIncludes).map(
    bind => get(behavioursByBind, [bind, 'includes'], [])
  ))
  const customBehaviorHeaders = collectBehaviorTypeIncludes(
    [...behaviorOverrides, ...behaviorDefinitions],
    behaviourTypeByCompatible
  )

  return uniq(
    [...behaviourHeaders, ...comboHeaders, ...customBehaviorHeaders]
      .map(line => parseIncludeLine(line))
      .filter(Boolean)
      .map(item => item.raw)
  )
}

function hasMissingNewRequiredIncludes (sourceCode, sourceKeymap, targetKeymap, options = {}) {
  if (typeof sourceCode !== 'string') {
    return true
  }

  const existingIncludes = new Set(collectIncludeLines(sourceCode).map(item => item.raw))
  const sourceRequired = new Set(collectDynamicIncludeLinesForKeymap(sourceKeymap, options))
  const targetRequired = collectDynamicIncludeLinesForKeymap(targetKeymap, options)
  return targetRequired.some(include => !sourceRequired.has(include) && !existingIncludes.has(include))
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

function renderPropertyValue (value, type) {
  switch (type) {
    case 'string':
      return `"${escapeString(value)}"`
    case 'int':
    case 'uint':
    case 'number':
    case 'angle':
      return `<${Number(value)}>`
    case 'bindings':
      return renderBindingsValue(value)
    case 'token':
      return `<${String(value).trim()}>`
    case 'token-array':
    case 'cell-array':
      return renderTokenArrayValue(value)
    default:
      return renderDefaultPropertyValue(value)
  }
}

function renderPropertyLine (name, value, type, indent) {
  if (type === 'boolean' || typeof value === 'boolean') {
    return value ? `${indent}${name};\n` : ''
  }

  const renderedValue = renderPropertyValue(value, type)

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

function renderComboDefinitions (nodes, behaviourTypeByCompatible) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return ''
  }

  const children = nodes.map(node => renderBehaviorNode(node, 2, behaviourTypeByCompatible)).join('')
  return `    combos {\n` +
    '        compatible = "zmk,combos";\n' +
    `${children}` +
    '    };\n'
}

function renderBehaviorDefinitions (nodes, behaviourTypeByCompatible) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return ''
  }

  const children = nodes.map(node => renderBehaviorNode(node, 2, behaviourTypeByCompatible)).join('')
  return `    behaviors {\n${children}    };\n`
}

function splitMacroAndBehaviorDefinitions (nodes) {
  const normalized = Array.isArray(nodes) ? nodes : []
  const macroDefinitions = []
  const behaviorDefinitions = []

  for (const node of normalized) {
    const compatible = node?.properties?.compatible || node?.compatible
    if (isMacroCompatible(compatible)) {
      macroDefinitions.push(node)
    } else {
      behaviorDefinitions.push(node)
    }
  }

  return { macroDefinitions, behaviorDefinitions }
}

function renderMacroDefinitions (nodes, behaviourTypeByCompatible) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return ''
  }

  const children = nodes.map(node => renderBehaviorNode(node, 2, behaviourTypeByCompatible)).join('')
  return `    macros {\n${children}    };\n`
}

function renderBehaviorChildrenSnippet (nodes, behaviourTypes = []) {
  const normalized = normalizeBehaviorList(nodes)
  if (!normalized.length) {
    return ''
  }

  const behaviourTypeByCompatible = keyBy(behaviourTypes || [], 'compatible')
  return normalized.map(node => renderBehaviorNode(node, 0, behaviourTypeByCompatible)).join('')
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
  const comboDefinitionsPattern = /\{\{\s*rendered_combo_definitions\s*\}\}/
  const macroDefinitionsPattern = /\{\{\s*rendered_macro_definitions\s*\}\}/
  const definitionsPattern = /\{\{\s*rendered_behavior_definitions\s*\}\}/

  const renderedLayers = renderLayers(params)
  const renderedKeymap = KEYMAP_BLOCK_TEMPLATE.replace(layersPattern, renderedLayers)
  const splitDefinitions = splitMacroAndBehaviorDefinitions(params.behaviorDefinitions)
  const renderedComboDefinitions = renderComboDefinitions(params.comboDefinitions, params.behaviourTypeByCompatible)
  const renderedBehaviorOverrides = renderBehaviorOverrides(params.behaviorOverrides, params.behaviourTypeByCompatible)
  const renderedMacroDefinitions = renderMacroDefinitions(splitDefinitions.macroDefinitions, params.behaviourTypeByCompatible)
  const renderedBehaviorDefinitions = renderBehaviorDefinitions(splitDefinitions.behaviorDefinitions, params.behaviourTypeByCompatible)

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

  if (comboDefinitionsPattern.test(output)) {
    output = output.replace(comboDefinitionsPattern, renderedComboDefinitions)
  } else {
    output = insertBeforeKeymap(output, renderedComboDefinitions)
  }

  if (macroDefinitionsPattern.test(output)) {
    output = output.replace(macroDefinitionsPattern, renderedMacroDefinitions)
  } else {
    output = insertBeforeKeymap(output, renderedMacroDefinitions)
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

  const comboDefinitions = normalizeBehaviorList(keymap.combos)
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
  const comboHeaders = flatten(getComboBehavioursUsed(keymapForIncludes).map(
    bind => get(behavioursByBind, [bind, 'includes'], [])
  ))

  const customBehaviorHeaders = collectBehaviorTypeIncludes(
    [...behaviorOverrides, ...behaviorDefinitions],
    behaviourTypeByCompatible
  )

  return renderTemplate(template, {
    layout,
    behaviourHeaders: [...behaviourHeaders, ...comboHeaders, ...customBehaviorHeaders],
    layers: encoded.layers,
    layerNames: names,
    sensorLayers: encoded.sensor_layers,
    sensors: options.sensors,
    comboDefinitions,
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

export {
  EDITOR_METADATA_KEY,
  encodeKeymap,
  parseKeyBinding,
  parseKeymap,
  generateKeymap,
  renderBehaviorChildrenSnippet
}
