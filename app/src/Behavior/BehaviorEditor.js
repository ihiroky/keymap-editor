import keyBy from 'lodash/keyBy'
import PropTypes from 'prop-types'
import { useEffect, useMemo, useState } from 'react'

import { getBehaviourParams } from '../keymap'
import ValuePicker from '../ValuePicker'
import styles from './styles.module.css'
import { parseBehaviorChildrenSnippet } from '../shared/zmk/keymap-code'
import { renderBehaviorChildrenSnippet } from '../shared/zmk/keymap'

const RAW_TYPE_CHOICES = [
  'raw',
  'string',
  'int',
  'boolean',
  'token',
  'token-array',
  'bindings'
]

const MOD_MORPH_MOD_CHOICES = [
  'MOD_LSFT',
  'MOD_RSFT',
  'MOD_LCTL',
  'MOD_RCTL',
  'MOD_LALT',
  'MOD_RALT',
  'MOD_LGUI',
  'MOD_RGUI'
]

const MOD_MORPH_MOD_SET = new Set(MOD_MORPH_MOD_CHOICES)

function cloneNode (node) {
  return {
    ...node,
    properties: { ...(node.properties || {}) },
    property_types: { ...(node.property_types || {}) },
    property_order: Array.isArray(node.property_order) ? [...node.property_order] : [],
    children: Array.isArray(node.children) ? [...node.children] : []
  }
}

function sanitizeLabel (label) {
  const cleaned = String(label || '')
    .trim()
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^_+/, '')

  return cleaned || 'behavior'
}

function nextLabel (existing, hint) {
  const base = sanitizeLabel(hint || 'behavior')
  if (!existing.includes(base)) {
    return base
  }

  for (let i = 2; i < 9999; i += 1) {
    const candidate = `${base}_${i}`
    if (!existing.includes(candidate)) {
      return candidate
    }
  }

  return `${base}_${Date.now()}`
}

function splitArrayInput (text) {
  return String(text || '')
    .split(/[\n,]/)
    .map(entry => entry.trim())
    .filter(Boolean)
}

function asInputValue (value, type) {
  if (type === 'boolean') {
    return Boolean(value)
  }
  if (Array.isArray(value)) {
    return value.join('\n')
  }
  if (value === undefined || value === null) {
    return ''
  }

  return String(value)
}

function normalizeNode (node, kind) {
  const properties = node?.properties && typeof node.properties === 'object'
    ? { ...node.properties }
    : {}
  const label = typeof node?.label === 'string' ? node.label : ''
  const defaultName = kind === 'override' ? '&mt' : (label ? `${sanitizeLabel(label)}_node` : 'behavior_node')
  const name = typeof node?.name === 'string' && node.name.trim()
    ? node.name.trim()
    : defaultName

  const bind = kind === 'override'
    ? (name.startsWith('&') ? name : `&${name}`)
    : label
      ? `&${sanitizeLabel(label)}`
      : '&behavior'

  return {
    label,
    name,
    bind,
    compatible: properties.compatible || node?.compatible || '',
    properties,
    property_types: node?.property_types && typeof node.property_types === 'object'
      ? { ...node.property_types }
      : {},
    property_order: Array.isArray(node?.property_order) ? [...node.property_order] : Object.keys(properties),
    children: Array.isArray(node?.children) ? node.children : []
  }
}

function getSpecType (spec) {
  if (!spec || typeof spec !== 'object') {
    return 'raw'
  }

  return spec.type || 'raw'
}

function normalizeStoredPropertyType (specType) {
  const map = {
    'behavior-bindings': 'bindings',
    select: 'token',
    int: 'int',
    string: 'string',
    token: 'token',
    'token-array': 'token-array',
    bindings: 'bindings',
    boolean: 'boolean',
    raw: 'raw'
  }

  return map[specType] || 'raw'
}

function defaultValueBySpec (spec, context = {}) {
  if (!spec || typeof spec !== 'object') {
    return ''
  }

  if (Object.prototype.hasOwnProperty.call(spec, 'fixed')) {
    return spec.fixed
  }

  if (Object.prototype.hasOwnProperty.call(spec, 'default')) {
    return spec.default
  }

  const specType = getSpecType(spec)
  if (specType === 'boolean') {
    return false
  }
  if (specType === 'int') {
    return 0
  }
  if (specType === 'behavior-bindings') {
    const minItems = getBindingListMinCount(spec, context.node)
    const fallback = context.behaviourChoices?.find(choice => choice.code === '&none')?.code || ''
    return Array.from({ length: minItems }, () => fallback)
  }
  if (specType === 'token-array' || specType === 'bindings') {
    return []
  }
  if (specType === 'select') {
    const options = Array.isArray(spec.options) ? spec.options : []
    return options[0] || ''
  }

  return ''
}

function toBindingArray (value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item)).filter(Boolean)
  }

  if (typeof value === 'string') {
    return splitArrayInput(value)
  }

  return []
}

function getBindingListMinCount (spec, node) {
  if (!spec || typeof spec !== 'object') {
    return 0
  }

  if (typeof spec.countFrom === 'string') {
    const count = Number(node?.properties?.[spec.countFrom])
    if (Number.isInteger(count) && count >= 0) {
      return count
    }
  }

  if (Number.isInteger(spec.minItems) && spec.minItems >= 0) {
    return spec.minItems
  }

  return 0
}

function parseBinding (binding) {
  const text = String(binding || '').trim()
  if (!text) {
    return { behavior: '&none', paramsText: '' }
  }

  const [behavior, ...rest] = text.split(/\s+/)
  return {
    behavior: behavior || '&none',
    paramsText: rest.join(' ')
  }
}

function renderBinding ({ behavior, paramsText }) {
  return `${String(behavior || '&none').trim()} ${String(paramsText || '').trim()}`.trim()
}

function splitParamsText (text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .map(value => value.trim())
    .filter(Boolean)
}

function toParamNodes (tokens) {
  return (tokens || []).map(value => ({ value, params: [] }))
}

function getParamType (spec) {
  if (typeof spec === 'string') {
    return spec
  }
  if (spec && typeof spec === 'object' && typeof spec.type === 'string') {
    return spec.type
  }
  return 'raw'
}

function getParamLabel (spec, index) {
  if (spec && typeof spec === 'object' && typeof spec.name === 'string' && spec.name.trim()) {
    return spec.name.trim()
  }

  if (typeof spec === 'string') {
    return spec
  }

  return `Param ${index + 1}`
}

function getParamOptions (spec, behavior, layerNames, keycodes) {
  if (spec && typeof spec === 'object' && Array.isArray(spec.enum)) {
    return spec.enum.map(option => String(option))
  }

  const type = getParamType(spec)
  if (type === 'layer') {
    if (Array.isArray(layerNames) && layerNames.length > 0) {
      return layerNames.map((_, index) => String(index))
    }
    return []
  }

  if (type === 'mod') {
    return (Array.isArray(keycodes) ? keycodes : [])
      .filter(item => item?.isModifier === true)
      .map(item => String(item.code || '').trim())
      .filter(Boolean)
  }

  if (type === 'code') {
    return (Array.isArray(keycodes) ? keycodes : [])
      .map(item => String(item.code || '').trim())
      .filter(Boolean)
  }

  if (type === 'command') {
    return (Array.isArray(behavior?.commands) ? behavior.commands : [])
      .map(item => String(item?.code || '').trim())
      .filter(Boolean)
  }

  return []
}

function getDefaultParamValue (spec, behavior, layerNames, keycodes) {
  const options = getParamOptions(spec, behavior, layerNames, keycodes)
  if (options.length > 0) {
    return options[0]
  }

  const type = getParamType(spec)
  if (type === 'layer') {
    return '0'
  }

  return ''
}

function buildPickerChoices (options, spec, behavior, layerNames) {
  const type = getParamType(spec)

  if (type === 'layer' && Array.isArray(layerNames) && layerNames.length > 0) {
    return options.map(option => {
      const index = Number(option)
      const label = layerNames[index]
      return {
        code: String(option),
        description: label ? `Layer ${option}: ${label}` : `Layer ${option}`
      }
    })
  }

  if (type === 'command') {
    return options.map(option => {
      const command = (Array.isArray(behavior?.commands) ? behavior.commands : [])
        .find(item => String(item?.code || '') === String(option))
      return {
        code: String(option),
        description: command?.description || ''
      }
    })
  }

  return options.map(option => ({ code: String(option) }))
}

function normalizeParamsForBehavior (behavior, seedTokens, layerNames, keycodes) {
  if (!behavior || typeof behavior !== 'object') {
    return []
  }

  let tokens = Array.isArray(seedTokens) ? [...seedTokens] : []

  for (let pass = 0; pass < 4; pass += 1) {
    const specs = getBehaviourParams(toParamNodes(tokens), behavior)
    const filled = specs.map((spec, index) => {
      const current = String(tokens[index] || '').trim()
      if (current) {
        return current
      }
      return getDefaultParamValue(spec, behavior, layerNames, keycodes)
    })

    const stable = filled.length === tokens.length && filled.every((value, index) => value === tokens[index])
    tokens = filled
    if (stable) {
      break
    }
  }

  return tokens
}

function parseModMaskSelection (value) {
  const rawValues = Array.isArray(value)
    ? value.map(entry => String(entry || '').trim())
    : typeof value === 'string'
      ? [String(value).trim()]
      : []

  const parsed = new Set()
  for (const token of rawValues) {
    if (!token) {
      continue
    }

    const inner = token.replace(/^\(/, '').replace(/\)$/, '')
    const parts = inner
      .split('|')
      .map(part => part.trim())
      .filter(Boolean)

    for (const part of parts) {
      if (MOD_MORPH_MOD_SET.has(part)) {
        parsed.add(part)
      }
    }
  }

  return MOD_MORPH_MOD_CHOICES.filter(code => parsed.has(code))
}

function renderModMaskSelection (selected) {
  const normalized = MOD_MORPH_MOD_CHOICES.filter(code => selected.includes(code))
  if (!normalized.length) {
    return []
  }

  return [`(${normalized.join('|')})`]
}

function getPropertySpecMap (type) {
  if (!type || typeof type !== 'object') {
    return {}
  }

  return type.propertySpecs && typeof type.propertySpecs === 'object'
    ? type.propertySpecs
    : {}
}

function getKnownKeyList (type, kind) {
  if (!type) {
    return []
  }

  if (kind === 'override' && Array.isArray(type.overridePropertyKeys)) {
    return [...type.overridePropertyKeys]
  }

  const specs = getPropertySpecMap(type)
  return Object.keys(specs)
}

function ensureDefinitionTypeDefaults (node, type, behaviourChoices) {
  const next = cloneNode(node)
  const specs = getPropertySpecMap(type)

  for (const key of Object.keys(specs)) {
    const spec = specs[key]
    const required = spec?.required === true
    const hasFixed = Object.prototype.hasOwnProperty.call(spec || {}, 'fixed')

    if (hasFixed) {
      next.properties[key] = spec.fixed
    } else if (required && !(key in next.properties)) {
      next.properties[key] = defaultValueBySpec(spec, {
        node: next,
        behaviourChoices
      })
    }

    if (key in next.properties) {
      next.property_types[key] = normalizeStoredPropertyType(getSpecType(spec))
      if (!next.property_order.includes(key)) {
        next.property_order.push(key)
      }
    }
  }

  next.compatible = next.properties.compatible || type.compatible || ''
  return next
}

function ensureOverrideDefaults (node, type, behaviourChoices) {
  const next = cloneNode(node)
  const specs = getPropertySpecMap(type)
  const allowedKeys = getKnownKeyList(type, 'override')

  for (const key of allowedKeys) {
    const spec = specs[key]
    if (!spec) {
      continue
    }
    if (!(key in next.properties) && Object.prototype.hasOwnProperty.call(spec, 'default')) {
      next.properties[key] = defaultValueBySpec(spec, {
        node: next,
        behaviourChoices
      })
      next.property_types[key] = normalizeStoredPropertyType(getSpecType(spec))
      if (!next.property_order.includes(key)) {
        next.property_order.push(key)
      }
    }
  }

  return next
}

function parseFieldValue (raw, type) {
  if (type === 'int') {
    const asNumber = Number(raw)
    return Number.isFinite(asNumber) ? asNumber : raw
  }
  if (type === 'boolean') {
    return Boolean(raw)
  }
  if (type === 'bindings' || type === 'token-array') {
    return splitArrayInput(raw)
  }

  return raw
}

function collectMissingBindings (keymap, availableBinds) {
  const binds = []
  const collectLayer = layer => {
    if (!Array.isArray(layer)) {
      return
    }
    layer.forEach(binding => {
      if (binding && typeof binding === 'object' && typeof binding.value === 'string') {
        binds.push(binding.value)
      }
    })
  }

  ;(keymap.layers || []).forEach(collectLayer)
  ;(keymap.sensor_layers || []).forEach(collectLayer)

  return [...new Set(binds.filter(bind => bind.startsWith('&') && !availableBinds.has(bind)))]
}

function validateNodes (definitions, overrides, typeByCompatible, overrideTypeByBind) {
  const errors = []
  const labels = definitions.map(node => node.label).filter(Boolean)
  const duplicated = labels.filter((label, index) => labels.indexOf(label) !== index)

  definitions.forEach((node, index) => {
    const ref = `Definition ${index + 1}`
    if (!node.label || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(node.label)) {
      errors.push(`${ref}: label must match ^[A-Za-z_][A-Za-z0-9_]*$`)
    }

    if (!node.name || !String(node.name).trim()) {
      errors.push(`${ref}: node name is required`)
    }

    const compatible = node.properties?.compatible || node.compatible
    if (!compatible) {
      errors.push(`${ref}: compatible is required`)
      return
    }

    const type = typeByCompatible[compatible]
    const specs = getPropertySpecMap(type)

    for (const key of Object.keys(specs)) {
      const spec = specs[key]
      const value = node.properties?.[key]
      if (spec?.required && (value === undefined || value === null || value === '')) {
        errors.push(`${ref}: required property "${key}" is missing`)
      }
      if (Object.prototype.hasOwnProperty.call(spec || {}, 'fixed') && value !== spec.fixed) {
        errors.push(`${ref}: property "${key}" must be fixed to "${spec.fixed}"`)
      }
      if (getSpecType(spec) === 'int' && value !== undefined && !Number.isFinite(Number(value))) {
        errors.push(`${ref}: property "${key}" must be numeric`)
      }
    }

    if (compatible === 'zmk,behavior-mod-morph') {
      const selectedMods = parseModMaskSelection(node.properties?.mods)
      if (selectedMods.length === 0) {
        errors.push(`${ref}: property "mods" must include at least one modifier`)
      }
    }
  })

  overrides.forEach((node, index) => {
    const ref = `Override ${index + 1}`
    if (!node.name || !String(node.name).trim()) {
      errors.push(`${ref}: override name is required`)
      return
    }

    if (!node.name.startsWith('&')) {
      errors.push(`${ref}: name must start with &`)
      return
    }

    const type = overrideTypeByBind[node.name]
    if (!type) {
      return
    }

    const specs = getPropertySpecMap(type)
    const knownKeys = getKnownKeyList(type, 'override')
    for (const key of knownKeys) {
      const spec = specs[key]
      const value = node.properties?.[key]
      if (getSpecType(spec) === 'int' && value !== undefined && value !== '' && !Number.isFinite(Number(value))) {
        errors.push(`${ref}: property "${key}" must be numeric`)
      }
    }
  })

  if (duplicated.length) {
    for (const label of [...new Set(duplicated)]) {
      errors.push(`Duplicate behavior label: ${label}`)
    }
  }

  return errors
}

function BehaviorEditor (props) {
  const { keymap, behaviorTypes, availableBehaviours, keycodes, onUpdate } = props

  const layerNames = useMemo(() => {
    if (Array.isArray(keymap?.layer_names) && keymap.layer_names.length > 0) {
      return keymap.layer_names
    }

    const layerCount = Array.isArray(keymap?.layers) ? keymap.layers.length : 0
    return Array.from({ length: layerCount }, (_, index) => `Layer ${index}`)
  }, [keymap])

  const behaviourChoices = useMemo(() => {
    const map = new Map()
    for (const behaviour of availableBehaviours || []) {
      if (!behaviour || typeof behaviour.code !== 'string') {
        continue
      }
      if (!map.has(behaviour.code)) {
        map.set(behaviour.code, {
          code: behaviour.code,
          name: behaviour.name || behaviour.code,
          description: behaviour.description || '',
          params: Array.isArray(behaviour.params) ? behaviour.params : [],
          commands: Array.isArray(behaviour.commands) ? behaviour.commands : []
        })
      }
    }

    if (!map.has('&none')) {
      map.set('&none', { code: '&none', name: 'None', description: '', params: [], commands: [] })
    }

    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [availableBehaviours])

  const behaviourByCode = useMemo(() => {
    const map = {}
    for (const behaviour of behaviourChoices) {
      map[behaviour.code] = behaviour
    }
    return map
  }, [behaviourChoices])

  const typeByCompatible = useMemo(() => keyBy(behaviorTypes || [], 'compatible'), [behaviorTypes])
  const overrideTypeByBind = useMemo(() => {
    const map = {}
    for (const type of behaviorTypes || []) {
      for (const bind of type.overrideBinds || []) {
        if (!(bind in map)) {
          map[bind] = type
        }
      }
    }
    return map
  }, [behaviorTypes])
  const overrideBindChoices = useMemo(() => (
    Object.keys(overrideTypeByBind).sort((a, b) => a.localeCompare(b))
  ), [overrideTypeByBind])

  const overrides = useMemo(() => (
    (keymap.behavior_overrides || []).map(node => normalizeNode(node, 'override'))
  ), [keymap])
  const definitions = useMemo(() => (
    (keymap.behavior_definitions || []).map(node => normalizeNode(node, 'definition'))
  ), [keymap])

  const [selection, setSelection] = useState(() => {
    if (definitions.length) {
      return { kind: 'definition', index: 0 }
    }
    if (overrides.length) {
      return { kind: 'override', index: 0 }
    }
    return null
  })
  const [childrenDraft, setChildrenDraft] = useState('')
  const [bindingParamPicker, setBindingParamPicker] = useState(null)

  useEffect(() => {
    if (!selection) {
      if (definitions.length > 0) {
        setSelection({ kind: 'definition', index: 0 })
      } else if (overrides.length > 0) {
        setSelection({ kind: 'override', index: 0 })
      }
      return
    }

    const list = selection.kind === 'definition' ? definitions : overrides
    if (!list[selection.index]) {
      if (list.length > 0) {
        setSelection({ kind: selection.kind, index: list.length - 1 })
      } else if (selection.kind === 'definition' && overrides.length > 0) {
        setSelection({ kind: 'override', index: 0 })
      } else if (selection.kind === 'override' && definitions.length > 0) {
        setSelection({ kind: 'definition', index: 0 })
      } else {
        setSelection(null)
      }
    }
  }, [selection, definitions, overrides])

  const selectedNode = useMemo(() => {
    if (!selection) {
      return null
    }
    const list = selection.kind === 'definition' ? definitions : overrides
    return list[selection.index] || null
  }, [selection, definitions, overrides])

  useEffect(() => {
    if (!selectedNode) {
      setChildrenDraft('')
      return
    }

    setChildrenDraft(renderBehaviorChildrenSnippet(
      selectedNode.children || [],
      behaviorTypes
    ))
  }, [selectedNode, behaviorTypes])

  useEffect(() => {
    setBindingParamPicker(null)
  }, [selection, selectedNode])

  const parsedChildrenDraft = useMemo(() => {
    if (!selectedNode) {
      return { children: [], error: null }
    }

    try {
      return {
        children: parseBehaviorChildrenSnippet(childrenDraft),
        error: null
      }
    } catch (err) {
      return {
        children: null,
        error: err?.message || String(err)
      }
    }
  }, [childrenDraft, selectedNode])

  const selectedType = useMemo(() => {
    if (!selectedNode || !selection) {
      return null
    }

    if (selection.kind === 'definition') {
      const compatible = selectedNode.properties?.compatible || selectedNode.compatible
      return compatible ? typeByCompatible[compatible] || null : null
    }

    return overrideTypeByBind[selectedNode.name] || null
  }, [selectedNode, selection, typeByCompatible, overrideTypeByBind])

  const selectedSpecMap = useMemo(() => (
    getPropertySpecMap(selectedType)
  ), [selectedType])

  const knownKeys = useMemo(() => {
    if (!selectedType || !selection) {
      return []
    }

    return getKnownKeyList(selectedType, selection.kind)
      .filter(key => !(selection.kind === 'definition' && key === 'compatible'))
  }, [selectedType, selection])

  const knownPresentKeys = useMemo(() => {
    if (!selectedNode) {
      return []
    }

    return knownKeys.filter(key => Object.prototype.hasOwnProperty.call(selectedNode.properties || {}, key))
  }, [selectedNode, knownKeys])

  const requiredKnownKeys = useMemo(() => (
    knownKeys.filter(key => {
      const spec = selectedSpecMap[key]
      return Boolean(spec?.required) || Object.prototype.hasOwnProperty.call(spec || {}, 'fixed')
    })
  ), [knownKeys, selectedSpecMap])

  const optionalKnownKeys = useMemo(() => (
    knownKeys.filter(key => !requiredKnownKeys.includes(key))
  ), [knownKeys, requiredKnownKeys])

  const requiredKnownPresentKeys = useMemo(() => (
    requiredKnownKeys.filter(key => knownPresentKeys.includes(key))
  ), [requiredKnownKeys, knownPresentKeys])

  const optionalKnownPresentKeys = useMemo(() => (
    optionalKnownKeys.filter(key => knownPresentKeys.includes(key))
  ), [optionalKnownKeys, knownPresentKeys])

  const missingKnownKeys = useMemo(() => (
    knownKeys.filter(key => !knownPresentKeys.includes(key))
  ), [knownKeys, knownPresentKeys])

  const rawKeys = useMemo(() => {
    if (!selectedNode) {
      return []
    }

    const hidden = new Set(knownKeys)
    if (selection?.kind === 'definition') {
      hidden.add('compatible')
    }
    return Object.keys(selectedNode.properties || {}).filter(key => !hidden.has(key))
  }, [selectedNode, knownKeys, selection])

  const availableBinds = useMemo(() => {
    const dynamicDefinitions = definitions
      .map(node => (node.label ? `&${sanitizeLabel(node.label)}` : null))
      .filter(Boolean)

    return new Set([
      ...behaviourChoices.map(choice => choice.code),
      ...dynamicDefinitions,
      ...overrides.map(node => node.name).filter(Boolean)
    ])
  }, [behaviourChoices, definitions, overrides])

  const missingBindings = useMemo(() => (
    collectMissingBindings(keymap, availableBinds)
  ), [keymap, availableBinds])

  const validationErrors = useMemo(() => (
    validateNodes(definitions, overrides, typeByCompatible, overrideTypeByBind)
  ), [definitions, overrides, typeByCompatible, overrideTypeByBind])

  const updateCollection = (kind, nextCollection) => {
    const payload = {
      ...keymap,
      behavior_definitions: kind === 'definition' ? nextCollection : definitions,
      behavior_overrides: kind === 'override' ? nextCollection : overrides
    }

    onUpdate(payload)
  }

  const updateSelectedNode = updater => {
    if (!selection) {
      return
    }

    const list = selection.kind === 'definition' ? definitions : overrides
    const nextList = [...list]
    const current = nextList[selection.index]
    if (!current) {
      return
    }

    nextList[selection.index] = updater(cloneNode(current))
    updateCollection(selection.kind, nextList)
  }

  const setKnownProperty = (key, value, spec) => {
    const specType = getSpecType(spec)
    updateSelectedNode(current => {
      const next = cloneNode(current)
      next.properties[key] = value
      next.property_types[key] = normalizeStoredPropertyType(specType)
      if (!next.property_order.includes(key)) {
        next.property_order.push(key)
      }
      return next
    })
  }

  const removeKnownProperty = key => {
    updateSelectedNode(current => {
      const next = cloneNode(current)
      delete next.properties[key]
      delete next.property_types[key]
      next.property_order = next.property_order.filter(entry => entry !== key)
      return next
    })
  }

  const addKnownProperty = key => {
    const spec = selectedSpecMap[key]
    const value = defaultValueBySpec(spec, {
      node: selectedNode,
      behaviourChoices
    })

    setKnownProperty(key, value, spec)
  }

  const isKnownPropertyRemovable = key => {
    const spec = selectedSpecMap[key]
    if (!selection || selection.kind !== 'definition') {
      return true
    }

    if (!spec || typeof spec !== 'object') {
      return true
    }

    if (spec.required) {
      return false
    }
    if (Object.prototype.hasOwnProperty.call(spec, 'fixed')) {
      return false
    }

    return true
  }

  const addDefinition = () => {
    if (!behaviorTypes.length) {
      return
    }

    const type = behaviorTypes[0]
    const used = definitions.map(node => node.label).filter(Boolean)
    const label = nextLabel(used, type.defaultLabelHints?.[0] || 'behavior')

    const base = {
      label,
      name: `${label}_node`,
      bind: `&${label}`,
      compatible: type.compatible,
      properties: {},
      property_types: {},
      property_order: [],
      children: []
    }

    const node = ensureDefinitionTypeDefaults(base, type, behaviourChoices)
    const next = [...definitions, node]
    updateCollection('definition', next)
    setSelection({ kind: 'definition', index: next.length - 1 })
  }

  const addOverride = () => {
    const initialBind = overrideBindChoices[0] || '&mt'
    const type = overrideTypeByBind[initialBind]

    const base = {
      label: null,
      name: initialBind,
      bind: initialBind,
      compatible: '',
      properties: {},
      property_types: {},
      property_order: [],
      children: []
    }

    const node = type
      ? ensureOverrideDefaults(base, type, behaviourChoices)
      : base
    const next = [...overrides, node]
    updateCollection('override', next)
    setSelection({ kind: 'override', index: next.length - 1 })
  }

  const removeSelected = () => {
    if (!selection) {
      return
    }

    const list = selection.kind === 'definition' ? definitions : overrides
    const next = list.filter((_, index) => index !== selection.index)
    updateCollection(selection.kind, next)
  }

  const renderBehaviorBindingsInput = (node, key, spec) => {
    const current = toBindingArray(node.properties?.[key])
    const minCount = getBindingListMinCount(spec, node)
    const fallbackChoice = behaviourChoices.find(choice => choice.code === '&none')?.code || ''

    const normalized = [...current]
    while (normalized.length < minCount) {
      normalized.push(fallbackChoice)
    }

    const countFrom = typeof spec?.countFrom === 'string' ? spec.countFrom : null
    const fixedLength = countFrom
      ? Number.isInteger(Number(node.properties?.[countFrom]))
      : false

    const updateAt = (index, value) => {
      const nextValues = [...normalized]
      nextValues[index] = value
      setKnownProperty(key, nextValues, spec)
    }

    const removeAt = index => {
      if (normalized.length <= minCount) {
        return
      }
      const nextValues = normalized.filter((_, i) => i !== index)
      setKnownProperty(key, nextValues, spec)
    }

    const addOne = () => {
      const nextValues = [...normalized, fallbackChoice]
      setKnownProperty(key, nextValues, spec)
    }

    return (
      <div className={styles.bindingList}>
        {normalized.map((value, index) => {
          const parsed = parseBinding(value)
          const knownBindingChoice = behaviourChoices.some(choice => choice.code === parsed.behavior)
          const selectedBehavior = knownBindingChoice ? (behaviourByCode[parsed.behavior] || null) : null
          const selectedCode = knownBindingChoice ? parsed.behavior : '__custom__'
          const rawParamTokens = splitParamsText(parsed.paramsText)
          const normalizedParamTokens = selectedBehavior
            ? normalizeParamsForBehavior(selectedBehavior, rawParamTokens, layerNames, keycodes)
            : rawParamTokens
          const selectedParamSpecs = selectedBehavior
            ? getBehaviourParams(toParamNodes(normalizedParamTokens), selectedBehavior)
            : []
          const selectedParamOptions = selectedParamSpecs.map(spec => (
            getParamOptions(spec, selectedBehavior, layerNames, keycodes)
          ))
          const canUsePicker = selectedBehavior &&
            selectedParamSpecs.length > 0 &&
            selectedParamOptions.every(options => options.length > 0)
          const showManualParams = !knownBindingChoice || (selectedParamSpecs.length > 0 && !canUsePicker)

          const setKnownBehaviorBinding = behaviorCode => {
            const definition = behaviourByCode[behaviorCode]
            if (!definition) {
              updateAt(index, renderBinding({ behavior: behaviorCode, paramsText: parsed.paramsText }))
              return
            }

            const tokens = normalizeParamsForBehavior(
              definition,
              rawParamTokens,
              layerNames,
              keycodes
            )
            updateAt(index, renderBinding({
              behavior: behaviorCode,
              paramsText: tokens.join(' ')
            }))
          }

          const setKnownBehaviorParam = (paramIndex, paramValue) => {
            if (!selectedBehavior) {
              return
            }

            const nextSeed = [...normalizedParamTokens]
            nextSeed[paramIndex] = String(paramValue || '').trim()
            const nextTokens = normalizeParamsForBehavior(
              selectedBehavior,
              nextSeed,
              layerNames,
              keycodes
            )
            updateAt(index, renderBinding({
              behavior: parsed.behavior,
              paramsText: nextTokens.join(' ')
            }))
          }

          return (
            <div className={styles.bindingEntry} key={`binding-${key}-${index}`}>
              <div className={styles.bindingRow}>
                <select
                  value={selectedCode}
                  onChange={event => {
                    const nextCode = event.target.value
                    if (nextCode === '__custom__') {
                      return
                    }
                    setKnownBehaviorBinding(nextCode)
                  }}
                >
                  {behaviourChoices.map(choice => (
                    <option key={`binding-option-${key}-${index}-${choice.code}`} value={choice.code}>
                      {choice.code}
                    </option>
                  ))}
                  <option value='__custom__'>Custom</option>
                </select>
                <input
                  type='text'
                  aria-label={`binding-behavior-custom-${key}-${index}`}
                  value={parsed.behavior}
                  placeholder='&my_behavior'
                  disabled={knownBindingChoice}
                  onChange={event => {
                    if (knownBindingChoice) {
                      return
                    }

                    updateAt(index, renderBinding({
                      behavior: event.target.value,
                      paramsText: parsed.paramsText
                    }))
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  disabled={fixedLength || normalized.length <= minCount}
                >
                  Remove
                </button>
              </div>

              {showManualParams && (
                <div className={styles.bindingMeta}>
                  <div className={styles.bindingHint}>
                    Parameter candidates are open-ended. Enter them as space-separated tokens.
                  </div>
                  <input
                    type='text'
                    aria-label={`binding-params-manual-${key}-${index}`}
                    value={parsed.paramsText}
                    placeholder='PARAM1 PARAM2'
                    onChange={event => {
                      updateAt(index, renderBinding({
                        behavior: parsed.behavior,
                        paramsText: event.target.value
                      }))
                    }}
                  />
                </div>
              )}

              {canUsePicker && (
                <div className={styles.paramList}>
                  {selectedParamSpecs.map((spec, paramIndex) => {
                    const label = getParamLabel(spec, paramIndex)
                    const options = selectedParamOptions[paramIndex]
                    const pickerChoices = buildPickerChoices(options, spec, selectedBehavior, layerNames)
                    const value = String(normalizedParamTokens[paramIndex] || '')
                    const pickerOpen = (
                      bindingParamPicker?.propertyKey === key &&
                      bindingParamPicker?.bindingIndex === index &&
                      bindingParamPicker?.paramIndex === paramIndex
                    )

                    return (
                      <div className={styles.paramRow} key={`binding-param-${key}-${index}-${paramIndex}`}>
                        <label>{label}</label>
                        <button
                          type='button'
                          className={styles.paramPickerButton}
                          aria-label={`binding-param-picker-${key}-${index}-${paramIndex}`}
                          onClick={() => {
                            setBindingParamPicker({
                              propertyKey: key,
                              bindingIndex: index,
                              paramIndex,
                              value,
                              label,
                              choices: pickerChoices
                            })
                          }}
                        >
                          {value || '(select)'}
                        </button>
                        {pickerOpen && (
                          <div className={styles.paramPicker}>
                            <ValuePicker
                              target={{}}
                              value={String(bindingParamPicker?.value || '')}
                              param={{ type: 'raw', name: label }}
                              currentNode={{ value: bindingParamPicker?.value || '', params: [] }}
                              choices={bindingParamPicker?.choices || []}
                              prompt={`Select ${label}`}
                              searchKey='code'
                              onSelect={choice => {
                                const nextValue = String(choice?.code ?? choice?.value ?? '').trim()
                                setKnownBehaviorParam(paramIndex, nextValue)
                                setBindingParamPicker(null)
                              }}
                              onCancel={() => setBindingParamPicker(null)}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        <button
          type="button"
          onClick={addOne}
          disabled={fixedLength}
        >
          Add Binding
        </button>
      </div>
    )
  }

  const renderModMaskInput = (node, key, spec) => {
    const selected = parseModMaskSelection(node.properties?.[key])
    const selectedSet = new Set(selected)
    const rendered = renderModMaskSelection(selected)
    const renderedValue = rendered[0] || ''

    const updateSelection = nextSelection => {
      setKnownProperty(key, renderModMaskSelection(nextSelection), spec)
    }

    return (
      <div className={styles.modMaskInput}>
        <div className={styles.modMaskGrid}>
          {MOD_MORPH_MOD_CHOICES.map(code => (
            <label className={styles.modMaskOption} key={`${key}-${code}`}>
              <input
                type='checkbox'
                aria-label={`${key}-${code}`}
                checked={selectedSet.has(code)}
                onChange={event => {
                  const next = new Set(selected)
                  if (event.target.checked) {
                    next.add(code)
                  } else {
                    next.delete(code)
                  }
                  updateSelection(MOD_MORPH_MOD_CHOICES.filter(item => next.has(item)))
                }}
              />
              <span>{code}</span>
            </label>
          ))}
        </div>
        <div className={styles.modMaskPreview}>
          {renderedValue
            ? `${key} = <${renderedValue}>;`
            : `Select one or more modifiers for ${key}.`
          }
        </div>
      </div>
    )
  }

  const renderKnownInput = (node, key) => {
    const spec = selectedSpecMap[key] || {}
    const specType = getSpecType(spec)
    const value = node.properties?.[key]
    const inputValue = asInputValue(value, specType)
    const fixed = Object.prototype.hasOwnProperty.call(spec, 'fixed')

    if (specType === 'behavior-bindings') {
      return renderBehaviorBindingsInput(node, key, spec)
    }

    if (specType === 'boolean') {
      return (
        <input
          type="checkbox"
          checked={Boolean(inputValue)}
          disabled={fixed}
          onChange={event => setKnownProperty(key, event.target.checked, spec)}
        />
      )
    }

    if (specType === 'select') {
      const options = Array.isArray(spec.options) ? spec.options : []
      return (
        <select
          value={String(inputValue)}
          disabled={fixed}
          onChange={event => setKnownProperty(key, event.target.value, spec)}
        >
          <option value="">(none)</option>
          {options.map(option => (
            <option key={`known-option-${key}-${option}`} value={option}>{option}</option>
          ))}
        </select>
      )
    }

    if (specType === 'token-array' || specType === 'bindings') {
      const isModMask = selectedType?.compatible === 'zmk,behavior-mod-morph' &&
        (key === 'mods' || key === 'keep-mods')
      if (isModMask) {
        return renderModMaskInput(node, key, spec)
      }

      return (
        <textarea
          value={inputValue}
          disabled={fixed}
          onChange={event => setKnownProperty(
            key,
            parseFieldValue(event.target.value, specType),
            spec
          )}
        />
      )
    }

    const inputType = specType === 'int' ? 'number' : 'text'
    return (
      <input
        type={inputType}
        value={inputValue}
        disabled={fixed}
        onChange={event => setKnownProperty(
          key,
          parseFieldValue(event.target.value, specType),
          spec
        )}
      />
    )
  }

  return (
    <div className={styles.editor}>
      <div className={styles.sidebar}>
        <div className={styles.sectionHeader}>Definitions</div>
        <div className={styles.list}>
          {definitions.map((node, index) => (
            <button
              type="button"
              key={`definition-${index}`}
              className={styles.listItem}
              data-selected={selection?.kind === 'definition' && selection?.index === index ? 'true' : 'false'}
              onClick={() => setSelection({ kind: 'definition', index })}
            >
              {node.label ? `&${node.label}` : node.name}
            </button>
          ))}
        </div>

        <div className={styles.sectionHeader}>Overrides</div>
        <div className={styles.list}>
          {overrides.map((node, index) => (
            <button
              type="button"
              key={`override-${index}`}
              className={styles.listItem}
              data-selected={selection?.kind === 'override' && selection?.index === index ? 'true' : 'false'}
              onClick={() => setSelection({ kind: 'override', index })}
            >
              {node.name}
            </button>
          ))}
        </div>

        <div className={styles.actions}>
          <button type="button" onClick={addDefinition}>Add Definition</button>
          <button type="button" onClick={addOverride}>Add Override</button>
          <button type="button" onClick={removeSelected} disabled={!selection}>Delete Selected</button>
        </div>
      </div>

      <div className={styles.panel}>
        {validationErrors.length > 0 && (
          <div className={styles.errors}>
            {validationErrors.map((error, index) => (
              <div key={`error-${index}`}>{error}</div>
            ))}
          </div>
        )}

        {missingBindings.length > 0 && (
          <div className={styles.warnings}>
            {missingBindings.map(bind => (
              <div key={`warning-${bind}`}>Unresolved behavior bind in keymap: {bind}</div>
            ))}
          </div>
        )}

        {!selectedNode && (
          <p>Select or create a behavior item.</p>
        )}

        {selectedNode && (
          <>
            <div className={styles.formRow}>
              <label>Kind</label>
              <div>{selection.kind === 'definition' ? 'Definition' : 'Override'}</div>
            </div>

            <div className={styles.group}>
              <div className={styles.groupTitle}>Required Properties</div>
              {selection.kind === 'definition' && (
                <div className={styles.formRow}>
                  <label>Label</label>
                  <input
                    type="text"
                    value={selectedNode.label || ''}
                    onChange={event => {
                      const input = sanitizeLabel(event.target.value)
                      updateSelectedNode(current => {
                        const next = cloneNode(current)
                        next.label = input
                        next.bind = `&${input}`
                        if (!next.name || !next.name.startsWith('&')) {
                          next.name = `${input}_node`
                        }
                        return next
                      })
                    }}
                  />
                </div>
              )}

              <div className={styles.formRow}>
                <label>{selection.kind === 'definition' ? 'Node Name' : 'Override Name'}</label>
                <input
                  type="text"
                  value={selectedNode.name || ''}
                  onChange={event => {
                    const value = event.target.value
                    updateSelectedNode(current => {
                      const next = cloneNode(current)
                      next.name = value
                      if (selection.kind === 'override') {
                        next.bind = value
                      }
                      return next
                    })
                  }}
                />
              </div>

              {selection.kind === 'override' && overrideBindChoices.length > 0 && (
                <div className={styles.formRow}>
                  <label>Known Override</label>
                  <select
                    value={overrideBindChoices.includes(selectedNode.name) ? selectedNode.name : ''}
                    onChange={event => {
                      const value = event.target.value
                      updateSelectedNode(current => {
                        const next = cloneNode(current)
                        next.name = value
                        next.bind = value
                        const type = overrideTypeByBind[value]
                        return type
                          ? ensureOverrideDefaults(next, type, behaviourChoices)
                          : next
                      })
                    }}
                  >
                    <option value="">(custom)</option>
                    {overrideBindChoices.map(bind => (
                      <option key={`override-bind-${bind}`} value={bind}>{bind}</option>
                    ))}
                  </select>
                </div>
              )}

              {selection.kind === 'definition' && (
                <div className={styles.formRow}>
                  <label>Compatible</label>
                  <select
                    value={selectedNode.properties?.compatible || selectedNode.compatible || ''}
                    onChange={event => {
                      const compatible = event.target.value
                      updateSelectedNode(current => {
                        const next = cloneNode(current)
                        next.compatible = compatible
                        next.properties.compatible = compatible
                        next.property_types.compatible = 'string'
                        if (!next.property_order.includes('compatible')) {
                          next.property_order.unshift('compatible')
                        }

                        const type = typeByCompatible[compatible]
                        return type
                          ? ensureDefinitionTypeDefaults(next, type, behaviourChoices)
                          : next
                      })
                    }}
                  >
                    <option value="">(none)</option>
                    {behaviorTypes.map(type => (
                      <option key={type.compatible} value={type.compatible}>
                        {type.displayName} ({type.compatible})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {requiredKnownPresentKeys.length === 0 && (
                <p className={styles.emptyHint}>No required known properties.</p>
              )}
              {requiredKnownPresentKeys.map(key => {
                const spec = selectedSpecMap[key]
                const removable = isKnownPropertyRemovable(key)
                const required = Boolean(spec?.required)
                const fixed = spec && Object.prototype.hasOwnProperty.call(spec, 'fixed')

                return (
                  <div className={styles.knownRow} key={`required-known-${key}`}>
                    <div className={styles.knownLabel}>
                      <span>{key}</span>
                      {required && <small>required</small>}
                      {fixed && <small>fixed</small>}
                    </div>
                    <div className={styles.knownInput}>{renderKnownInput(selectedNode, key)}</div>
                    <button
                      type="button"
                      onClick={() => removeKnownProperty(key)}
                      disabled={!removable}
                    >
                      Remove
                    </button>
                  </div>
                )
              })}
            </div>

            <div className={styles.group}>
              <div className={styles.groupTitle}>Optional Properties</div>
              {optionalKnownPresentKeys.length === 0 && (
                <p className={styles.emptyHint}>No optional properties added.</p>
              )}
              {optionalKnownPresentKeys.map(key => {
                const spec = selectedSpecMap[key]
                const removable = isKnownPropertyRemovable(key)
                const required = Boolean(spec?.required)
                const fixed = spec && Object.prototype.hasOwnProperty.call(spec, 'fixed')

                return (
                  <div className={styles.knownRow} key={`optional-known-${key}`}>
                    <div className={styles.knownLabel}>
                      <span>{key}</span>
                      {required && <small>required</small>}
                      {fixed && <small>fixed</small>}
                    </div>
                    <div className={styles.knownInput}>{renderKnownInput(selectedNode, key)}</div>
                    <button
                      type="button"
                      onClick={() => removeKnownProperty(key)}
                      disabled={!removable}
                    >
                      Remove
                    </button>
                  </div>
                )
              })}
            </div>

            <div className={styles.group}>
              <div className={styles.groupTitle}>Add Known Properties</div>
              {missingKnownKeys.length === 0 && (
                <p className={styles.emptyHint}>No known properties left to add.</p>
              )}
              {missingKnownKeys.length > 0 && (
                <div className={styles.addKnownList}>
                  {missingKnownKeys.map(key => (
                    <button
                      key={`add-known-${key}`}
                      type="button"
                      onClick={() => addKnownProperty(key)}
                    >
                      Add {key}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.group}>
              <div className={styles.groupTitle}>Raw Properties</div>
              {rawKeys.map(key => {
                const valueType = selectedNode.property_types?.[key] || 'raw'
                return (
                  <div className={styles.rawRow} key={`raw-${key}`}>
                    <input
                      type="text"
                      value={key}
                      onChange={event => {
                        const nextKey = event.target.value
                        if (!nextKey || nextKey === key) {
                          return
                        }
                        if (selection?.kind === 'definition' && nextKey === 'compatible') {
                          return
                        }

                        updateSelectedNode(current => {
                          const next = cloneNode(current)
                          const propertyValue = next.properties[key]
                          const propertyType = next.property_types[key] || 'raw'

                          delete next.properties[key]
                          delete next.property_types[key]
                          next.properties[nextKey] = propertyValue
                          next.property_types[nextKey] = propertyType
                          next.property_order = next.property_order.map(entry => (entry === key ? nextKey : entry))
                          return next
                        })
                      }}
                    />
                    <select
                      value={valueType}
                      onChange={event => {
                        const nextType = event.target.value
                        updateSelectedNode(current => {
                          const next = cloneNode(current)
                          next.property_types[key] = nextType
                          next.properties[key] = parseFieldValue(asInputValue(next.properties[key], nextType), nextType)
                          return next
                        })
                      }}
                    >
                      {RAW_TYPE_CHOICES.map(type => (
                        <option key={`raw-type-${key}-${type}`} value={type}>{type}</option>
                      ))}
                    </select>
                    <input
                      type={valueType === 'int' ? 'number' : 'text'}
                      value={asInputValue(selectedNode.properties[key], valueType)}
                      onChange={event => {
                        updateSelectedNode(current => {
                          const next = cloneNode(current)
                          next.properties[key] = parseFieldValue(event.target.value, valueType)
                          return next
                        })
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        updateSelectedNode(current => {
                          const next = cloneNode(current)
                          delete next.properties[key]
                          delete next.property_types[key]
                          next.property_order = next.property_order.filter(entry => entry !== key)
                          return next
                        })
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )
              })}

              <button
                type="button"
                onClick={() => {
                  updateSelectedNode(current => {
                    const next = cloneNode(current)
                    let key = 'property'
                    let index = 1
                    while (Object.prototype.hasOwnProperty.call(next.properties, key)) {
                      key = `property_${index}`
                      index += 1
                    }
                    next.properties[key] = ''
                    next.property_types[key] = 'raw'
                    next.property_order.push(key)
                    return next
                  })
                }}
              >
                Add Raw Property
              </button>
            </div>

            {selectedNode.children?.length > 0 && (
              <div className={styles.note}>
                Nested child nodes: {selectedNode.children.length}
              </div>
            )}

            <div className={styles.group}>
              <div className={styles.groupTitle}>Children (.keymap)</div>
              <div className={styles.childrenHelp}>
                Enter only child nodes that belong inside the parent block, for example <code>{'foo: bar { ... };'}</code>.
              </div>
              <textarea
                className={styles.childrenJson}
                aria-label="Children (.keymap)"
                value={childrenDraft}
                onChange={event => setChildrenDraft(event.target.value)}
              />
              <div className={styles.childrenActions}>
                <button
                  type="button"
                  onClick={() => {
                    if (!parsedChildrenDraft.children) {
                      return
                    }
                    setChildrenDraft(renderBehaviorChildrenSnippet(
                      parsedChildrenDraft.children,
                      behaviorTypes
                    ))
                  }}
                  disabled={Boolean(parsedChildrenDraft.error)}
                >
                  Format
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!parsedChildrenDraft.children) {
                      return
                    }

                    updateSelectedNode(current => {
                      const next = cloneNode(current)
                      next.children = parsedChildrenDraft.children
                      return next
                    })
                  }}
                  disabled={Boolean(parsedChildrenDraft.error)}
                >
                  Apply Children
                </button>
                {parsedChildrenDraft.error && (
                  <span className={styles.childrenError}>{parsedChildrenDraft.error}</span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

BehaviorEditor.propTypes = {
  keymap: PropTypes.object.isRequired,
  behaviorTypes: PropTypes.array.isRequired,
  availableBehaviours: PropTypes.array,
  keycodes: PropTypes.array,
  onUpdate: PropTypes.func.isRequired
}

BehaviorEditor.defaultProps = {
  availableBehaviours: [],
  keycodes: []
}

export default BehaviorEditor
