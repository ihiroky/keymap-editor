import cloneDeep from 'lodash/cloneDeep'
import isEqual from 'lodash/isEqual'
import PropTypes from 'prop-types'
import { useEffect, useMemo, useState } from 'react'

import Icon from '../Common/Icon'
import { getBehaviourParams } from '../keymap'
import ValuePicker from '../ValuePicker'
import { getKeyBoundingBox, getKeyStyles } from '../key-units'
import {
  getListChangeInfo,
  isAddedIndex,
  isIndexAdded,
  isIndexChanged,
  revertItemByIndex
} from '../shared/change-tracking'
import { confirmItemDeletion } from '../shared/confirm-destructive'
import styles from './styles.module.css'

const KNOWN_PROPERTY_KEYS = [
  'timeout-ms',
  'key-positions',
  'bindings',
  'layers',
  'require-prior-idle-ms',
  'slow-release'
]

const KNOWN_PROPERTY_TYPES = {
  'timeout-ms': 'int',
  'key-positions': 'token-array',
  bindings: 'bindings',
  layers: 'token-array',
  'require-prior-idle-ms': 'int',
  'slow-release': 'boolean'
}

const DEFAULT_PROPERTIES = {
  'timeout-ms': 50,
  'key-positions': [0, 1],
  bindings: ['&none'],
  layers: [],
  'require-prior-idle-ms': 0,
  'slow-release': false
}

const VALUE_PICKER_THRESHOLD = 25

function cloneComboNode (node) {
  return {
    ...node,
    properties: { ...(node.properties || {}) },
    property_types: { ...(node.property_types || {}) },
    property_order: Array.isArray(node.property_order) ? [...node.property_order] : [],
    children: Array.isArray(node.children) ? [...node.children] : []
  }
}

function sanitizeName (value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '_')

  const noLeadingDigits = cleaned.replace(/^[^A-Za-z_]+/, '')
  return noLeadingDigits || 'combo'
}

function nextName (existingNames) {
  const set = new Set(existingNames.map(item => String(item || '')))
  if (!set.has('combo')) {
    return 'combo'
  }

  for (let i = 2; i < 9999; i += 1) {
    const candidate = `combo_${i}`
    if (!set.has(candidate)) {
      return candidate
    }
  }

  return `combo_${Date.now()}`
}

function parseIntegerArrayInput (raw) {
  const tokens = String(raw || '')
    .split(/[\s,\n]+/)
    .map(token => token.trim())
    .filter(Boolean)

  if (!tokens.length) {
    return { valid: true, value: [] }
  }

  const values = []
  for (const token of tokens) {
    if (!/^-?\d+$/.test(token)) {
      return { valid: false, value: null }
    }

    const value = Number(token)
    if (!Number.isInteger(value)) {
      return { valid: false, value: null }
    }

    values.push(value)
  }

  return { valid: true, value: values }
}

function renderIntegerArrayValue (value) {
  if (!Array.isArray(value)) {
    return ''
  }

  return value.map(item => String(item)).join(' ')
}

function normalizeBindingList (value) {
  if (Array.isArray(value)) {
    return value
      .map(entry => String(entry || '').trim())
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    const text = value.trim()
    return text ? [text] : []
  }

  return []
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

function normalizeComboNode (node, layoutSize) {
  const properties = node?.properties && typeof node.properties === 'object'
    ? { ...node.properties }
    : {}
  const propertyTypes = node?.property_types && typeof node.property_types === 'object'
    ? { ...node.property_types }
    : {}
  const propertyOrder = Array.isArray(node?.property_order)
    ? [...node.property_order]
    : []
  const suggestedPositions = layoutSize >= 2
    ? [0, 1]
    : [0, 1]

  const defaults = {
    ...DEFAULT_PROPERTIES,
    'key-positions': suggestedPositions
  }

  for (const key of KNOWN_PROPERTY_KEYS) {
    if (!(key in properties)) {
      properties[key] = Array.isArray(defaults[key]) ? [...defaults[key]] : defaults[key]
    }

    if (!propertyTypes[key]) {
      propertyTypes[key] = KNOWN_PROPERTY_TYPES[key]
    }

    if (!propertyOrder.includes(key)) {
      propertyOrder.push(key)
    }
  }

  const name = sanitizeName(node?.name || '')
  const label = typeof node?.label === 'string' && node.label.trim()
    ? node.label.trim()
    : null

  const keyPositions = parseIntegerArrayInput(renderIntegerArrayValue(properties['key-positions']))
  const layers = parseIntegerArrayInput(renderIntegerArrayValue(properties.layers))

  properties.bindings = normalizeBindingList(properties.bindings)
  properties['key-positions'] = keyPositions.valid ? keyPositions.value : []
  properties.layers = layers.valid ? layers.value : []
  properties['timeout-ms'] = Number(properties['timeout-ms'])
  properties['require-prior-idle-ms'] = Number(properties['require-prior-idle-ms'])
  properties['slow-release'] = Boolean(properties['slow-release'])

  return {
    ...node,
    name,
    label,
    bind: node?.bind || `&${name}`,
    properties,
    property_types: propertyTypes,
    property_order: propertyOrder,
    children: Array.isArray(node?.children) ? node.children : []
  }
}

function toNonNegativeInteger (value) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0) {
    return null
  }
  return number
}

function validateComboCollection (combos, layoutSize) {
  const errors = []
  const names = combos.map(node => String(node?.name || '')).filter(Boolean)
  const duplicated = names.filter((name, index) => names.indexOf(name) !== index)

  combos.forEach((node, index) => {
    const ref = `Combo ${index + 1}`
    const name = String(node?.name || '').trim()
    if (!name || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) {
      errors.push(`${ref}: name must match ^[A-Za-z_][A-Za-z0-9_-]*$`)
    }

    const bindings = normalizeBindingList(node?.properties?.bindings)
    if (bindings.length !== 1) {
      errors.push(`${ref}: bindings must contain exactly one behavior binding`)
    } else if (!bindings[0].startsWith('&')) {
      errors.push(`${ref}: binding must start with &`)
    }

    const keyPositions = Array.isArray(node?.properties?.['key-positions'])
      ? node.properties['key-positions']
      : []
    if (keyPositions.length < 2) {
      errors.push(`${ref}: key-positions must contain at least two indices`)
    }

    const positionSet = new Set()
    for (const rawPosition of keyPositions) {
      const position = toNonNegativeInteger(rawPosition)
      if (position === null) {
        errors.push(`${ref}: key-positions must contain non-negative integers`)
        break
      }
      if (layoutSize > 0 && position >= layoutSize) {
        errors.push(`${ref}: key position ${position} is out of range`)
      }
      if (positionSet.has(position)) {
        errors.push(`${ref}: key-positions must not contain duplicates`)
      }
      positionSet.add(position)
    }

    const layers = Array.isArray(node?.properties?.layers)
      ? node.properties.layers
      : []
    const layerSet = new Set()
    for (const rawLayer of layers) {
      const layer = toNonNegativeInteger(rawLayer)
      if (layer === null) {
        errors.push(`${ref}: layers must contain non-negative integers`)
        break
      }
      if (layerSet.has(layer)) {
        errors.push(`${ref}: layers must not contain duplicates`)
      }
      layerSet.add(layer)
    }

    const timeout = toNonNegativeInteger(node?.properties?.['timeout-ms'])
    if (timeout === null) {
      errors.push(`${ref}: timeout-ms must be a non-negative integer`)
    }

    const priorIdle = toNonNegativeInteger(node?.properties?.['require-prior-idle-ms'])
    if (priorIdle === null) {
      errors.push(`${ref}: require-prior-idle-ms must be a non-negative integer`)
    }

    if (typeof node?.properties?.['slow-release'] !== 'boolean') {
      errors.push(`${ref}: slow-release must be boolean`)
    }
  })

  for (const name of [...new Set(duplicated)]) {
    errors.push(`Duplicate combo name: ${name}`)
  }

  return errors
}

function ComboEditor (props) {
  const { keymap, baseKeymap, layout, availableBehaviours, keycodes, onUpdate } = props
  const layoutSize = Array.isArray(layout) ? layout.length : 0
  const layerNames = Array.isArray(keymap?.layer_names) ? keymap.layer_names : []
  const baseComboNodesRaw = useMemo(() => (
    Array.isArray(baseKeymap?.combos) ? baseKeymap.combos : []
  ), [baseKeymap])
  const comboNodesRaw = useMemo(() => (
    Array.isArray(keymap?.combos) ? keymap.combos : []
  ), [keymap])

  const baseCombos = useMemo(() => (
    baseComboNodesRaw.length
      ? baseComboNodesRaw.map(node => normalizeComboNode(node, layoutSize))
      : []
  ), [baseComboNodesRaw, layoutSize])
  const combos = useMemo(() => (
    comboNodesRaw.length
      ? comboNodesRaw.map(node => normalizeComboNode(node, layoutSize))
      : []
  ), [comboNodesRaw, layoutSize])
  const comboChangeInfo = useMemo(() => (
    getListChangeInfo(baseCombos, combos)
  ), [baseCombos, combos])

  const behaviourChoices = useMemo(() => {
    const map = new Map()

    for (const behaviour of availableBehaviours || []) {
      const code = String(behaviour?.code || '').trim()
      if (!code) {
        continue
      }

      if (!map.has(code)) {
        map.set(code, {
          code,
          name: behaviour?.name || code,
          params: Array.isArray(behaviour?.params) ? behaviour.params : [],
          commands: Array.isArray(behaviour?.commands) ? behaviour.commands : []
        })
      }
    }

    if (!map.has('&none')) {
      map.set('&none', { code: '&none', name: 'None', params: [], commands: [] })
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

  const [selection, setSelection] = useState(() => (combos.length > 0 ? 0 : null))
  const [localErrors, setLocalErrors] = useState([])
  const [paramPicker, setParamPicker] = useState(null)

  useEffect(() => {
    if (selection === null) {
      if (combos.length > 0) {
        setSelection(0)
      }
      return
    }

    if (!combos[selection]) {
      setSelection(combos.length > 0 ? combos.length - 1 : null)
    }
  }, [selection, combos])

  const persistedErrors = useMemo(() => (
    validateComboCollection(combos, layoutSize)
  ), [combos, layoutSize])

  const visibleErrors = useMemo(() => {
    const seen = new Set()
    const merged = []

    for (const error of [...localErrors, ...persistedErrors]) {
      if (!seen.has(error)) {
        seen.add(error)
        merged.push(error)
      }
    }

    return merged
  }, [localErrors, persistedErrors])

  const selectedCombo = useMemo(() => {
    if (selection === null) {
      return null
    }

    return combos[selection] || null
  }, [selection, combos])
  const selectedBaseCombo = useMemo(() => {
    if (selection === null) {
      return null
    }

    return baseCombos[selection] || null
  }, [selection, baseCombos])
  const isFieldChanged = useMemo(() => function(currentValue, baseValue) {
    return !isEqual(currentValue, baseValue)
  }, [])

  const selectedBindingText = String(selectedCombo?.properties?.bindings?.[0] || '&none').trim() || '&none'
  const selectedBinding = parseBinding(selectedBindingText)
  const knownBindingChoice = behaviourChoices.some(choice => choice.code === selectedBinding.behavior)
  const selectedBehaviorDefinition = knownBindingChoice
    ? behaviourByCode[selectedBinding.behavior] || null
    : null
  const selectedRawParamTokens = splitParamsText(selectedBinding.paramsText)
  const selectedParamTokens = useMemo(() => (
    selectedBehaviorDefinition
      ? normalizeParamsForBehavior(
        selectedBehaviorDefinition,
        selectedRawParamTokens,
        layerNames,
        keycodes
      )
      : selectedRawParamTokens
  ), [selectedBehaviorDefinition, selectedRawParamTokens, layerNames, keycodes])
  const selectedParamSpecs = useMemo(() => (
    selectedBehaviorDefinition
      ? getBehaviourParams(toParamNodes(selectedParamTokens), selectedBehaviorDefinition)
      : []
  ), [selectedBehaviorDefinition, selectedParamTokens])

  useEffect(() => {
    setParamPicker(null)
  }, [selection, selectedBindingText])

  const commitCombos = updater => {
    const nextCombos = updater(cloneDeep(comboNodesRaw))
    const normalizedForValidation = nextCombos.map(node => normalizeComboNode(node, layoutSize))
    const errors = validateComboCollection(normalizedForValidation, layoutSize)
    if (errors.length > 0) {
      setLocalErrors(errors)
      return false
    }

    setLocalErrors([])
    onUpdate({
      ...keymap,
      combos: nextCombos
    })
    return true
  }

  const updateSelectedCombo = updater => {
    if (selection === null) {
      return
    }

    commitCombos(list => {
      const next = [...list]
      const current = next[selection]
      if (!current) {
        return list
      }

      const normalizedCurrent = normalizeComboNode(current, layoutSize)
      next[selection] = updater(cloneComboNode(normalizedCurrent))
      return next
    })
  }

  const addCombo = () => {
    const existingNames = combos.map(combo => combo?.name).filter(Boolean)
    const name = nextName(existingNames)

    const node = {
      label: null,
      name,
      bind: `&${name}`,
      properties: {
        'timeout-ms': 50,
        'key-positions': [0, 1],
        bindings: ['&none'],
        layers: [],
        'require-prior-idle-ms': 0,
        'slow-release': false
      },
      property_types: {
        'timeout-ms': 'int',
        'key-positions': 'token-array',
        bindings: 'bindings',
        layers: 'token-array',
        'require-prior-idle-ms': 'int',
        'slow-release': 'boolean'
      },
      property_order: [...KNOWN_PROPERTY_KEYS],
      children: []
    }

    const updated = commitCombos(list => [...list, node])
    if (updated) {
      setSelection(combos.length)
    }
  }

  const removeSelected = () => {
    if (selection === null) {
      return
    }

    const selectedCombo = combos[selection]
    const shouldDelete = confirmItemDeletion({
      kind: 'combo',
      name: selectedCombo?.name,
      mode: 'delete'
    })
    if (!shouldDelete) {
      return
    }

    commitCombos(list => list.filter((_, index) => index !== selection))
  }

  const discardComboAt = index => {
    if (isIndexAdded(index, baseCombos.length)) {
      const shouldRemove = confirmItemDeletion({
        kind: 'combo',
        name: combos[index]?.name,
        mode: 'remove-added'
      })
      if (!shouldRemove) {
        return
      }
    }

    const reverted = revertItemByIndex(baseComboNodesRaw, comboNodesRaw, index)
    setLocalErrors([])
    onUpdate({
      ...keymap,
      combos: reverted
    })
  }

  const setBinding = value => {
    updateSelectedCombo(current => {
      const next = cloneComboNode(current)
      next.properties.bindings = [value]
      next.property_types.bindings = 'bindings'
      if (!next.property_order.includes('bindings')) {
        next.property_order.push('bindings')
      }
      return next
    })
  }

  const setKnownBehaviorBinding = behaviorCode => {
    const definition = behaviourByCode[behaviorCode]
    if (!definition) {
      return
    }

    const normalizedTokens = normalizeParamsForBehavior(
      definition,
      selectedParamTokens,
      layerNames,
      keycodes
    )

    setBinding(renderBinding({
      behavior: behaviorCode,
      paramsText: normalizedTokens.join(' ')
    }))
  }

  const setKnownBehaviorParam = (index, value) => {
    if (!selectedBehaviorDefinition) {
      return
    }

    const nextSeed = [...selectedParamTokens]
    nextSeed[index] = String(value || '').trim()
    const normalizedTokens = normalizeParamsForBehavior(
      selectedBehaviorDefinition,
      nextSeed,
      layerNames,
      keycodes
    )

    setBinding(renderBinding({
      behavior: selectedBinding.behavior,
      paramsText: normalizedTokens.join(' ')
    }))
  }

  const setTokenArray = (key, rawText) => {
    const parsed = parseIntegerArrayInput(rawText)
    if (!parsed.valid) {
      setLocalErrors([`${key} must contain integers only`])
      return
    }

    updateSelectedCombo(current => {
      const next = cloneComboNode(current)
      next.properties[key] = parsed.value
      next.property_types[key] = 'token-array'
      if (!next.property_order.includes(key)) {
        next.property_order.push(key)
      }
      return next
    })
  }

  const setInteger = (key, rawValue) => {
    const value = Number(rawValue)
    if (!Number.isInteger(value) || value < 0) {
      setLocalErrors([`${key} must be a non-negative integer`])
      return
    }

    updateSelectedCombo(current => {
      const next = cloneComboNode(current)
      next.properties[key] = value
      next.property_types[key] = 'int'
      if (!next.property_order.includes(key)) {
        next.property_order.push(key)
      }
      return next
    })
  }

  const keyBounds = useMemo(() => {
    if (!Array.isArray(layout) || !layout.length) {
      return { width: 0, height: 0 }
    }

    const bounds = layout.map(key => getKeyBoundingBox(
      { x: key.x, y: key.y },
      { u: key.u || key.w || 1, h: key.h || 1 },
      { x: key.rx, y: key.ry, a: key.r }
    ))

    const maxX = bounds.reduce((result, item) => Math.max(result, item.max.x), 0)
    const maxY = bounds.reduce((result, item) => Math.max(result, item.max.y), 0)

    return {
      width: maxX,
      height: maxY
    }
  }, [layout])

  const selectedPositions = Array.isArray(selectedCombo?.properties?.['key-positions'])
    ? selectedCombo.properties['key-positions']
    : []

  return (
    <div className={styles.editor}>
      <div className={styles.sidebar}>
        <div className={styles.sectionHeader}>Combos</div>
        {(comboChangeInfo.addedCount > 0 || comboChangeInfo.deletedCount > 0) && (
          <div className={styles.changeSummary}>+{comboChangeInfo.addedCount} / Deleted {comboChangeInfo.deletedCount}</div>
        )}
        <div className={styles.list}>
          {combos.map((combo, index) => (
            <div key={`combo-${index}`} className={styles.listRow}>
              <button
                type='button'
                className={styles.listItem}
                data-selected={selection === index ? 'true' : 'false'}
                data-changed={comboChangeInfo.changedIndices.has(index) ? 'true' : 'false'}
                onClick={() => setSelection(index)}
              >
                {comboChangeInfo.changedIndices.has(index) && <span className={styles.diffDot} aria-hidden='true' />}
                {combo.name}
                {isAddedIndex(baseCombos, index) && <span className={styles.addedBadge}>Added</span>}
              </button>
              {isIndexChanged(baseCombos, combos, index) && (
                <button
                  type='button'
                  className={styles.revertButton}
                  aria-label={`Discard combo changes ${combo.name || index + 1}`}
                  title='Discard combo changes'
                  onClick={() => discardComboAt(index)}
                >
                  <Icon name='undo' />
                  {isIndexAdded(index, baseCombos.length) ? 'Remove' : 'Discard'}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className={styles.actions}>
          <button type='button' onClick={addCombo}>Add Combo</button>
          <button type='button' onClick={removeSelected} disabled={selection === null}>Delete Selected</button>
        </div>
      </div>

      <div className={styles.panel}>
        {visibleErrors.length > 0 && (
          <div className={styles.errors}>
            {visibleErrors.map((error, index) => (
              <div key={`combo-error-${index}`}>{error}</div>
            ))}
          </div>
        )}

        {!selectedCombo && (
          <p>Select or create a combo.</p>
        )}

        {selectedCombo && (
          <>
            <div
              className={styles.formRow}
              data-changed={isFieldChanged(selectedCombo.name, selectedBaseCombo?.name) ? 'true' : 'false'}
            >
              <label>Name</label>
              <input
                type='text'
                value={selectedCombo.name || ''}
                onChange={event => {
                  const name = sanitizeName(event.target.value)
                  updateSelectedCombo(current => {
                    const next = cloneComboNode(current)
                    next.name = name
                    next.bind = `&${name}`
                    return next
                  })
                }}
              />
            </div>

            <div
              className={styles.formRow}
              data-changed={isFieldChanged(selectedCombo.label, selectedBaseCombo?.label) ? 'true' : 'false'}
            >
              <label>Label (optional)</label>
              <input
                type='text'
                value={selectedCombo.label || ''}
                onChange={event => {
                  const value = event.target.value.trim()
                  updateSelectedCombo(current => {
                    const next = cloneComboNode(current)
                    next.label = value || null
                    return next
                  })
                }}
              />
            </div>

            <div
              className={styles.formRow}
              data-changed={isFieldChanged(selectedCombo.properties.bindings, selectedBaseCombo?.properties?.bindings) ? 'true' : 'false'}
            >
              <label>Binding</label>
              <div className={styles.bindingField}>
                <div className={styles.bindingRow}>
                  <select
                    value={knownBindingChoice ? selectedBinding.behavior : '__custom__'}
                    onChange={event => {
                      const behavior = event.target.value
                      if (behavior === '__custom__') {
                        return
                      }
                      setKnownBehaviorBinding(behavior)
                    }}
                  >
                    {behaviourChoices.map(choice => (
                      <option key={`combo-behavior-${choice.code}`} value={choice.code}>{choice.code}</option>
                    ))}
                    <option value='__custom__'>Custom</option>
                  </select>
                  <input
                    type='text'
                    aria-label='binding-behavior-custom'
                    value={knownBindingChoice ? selectedBinding.behavior : selectedBinding.behavior}
                    placeholder='&my_behavior'
                    disabled={knownBindingChoice}
                    onChange={event => {
                      if (knownBindingChoice) {
                        return
                      }

                      setBinding(renderBinding({
                        behavior: event.target.value,
                        paramsText: selectedBinding.paramsText
                      }))
                    }}
                  />
                </div>

                {knownBindingChoice && selectedParamSpecs.length > 0 && (
                  <div className={styles.paramList}>
                    {selectedParamSpecs.map((spec, index) => {
                      const label = getParamLabel(spec, index)
                      const options = getParamOptions(spec, selectedBehaviorDefinition, layerNames, keycodes)
                      const pickerChoices = buildPickerChoices(options, spec, selectedBehaviorDefinition, layerNames)
                      const value = String(selectedParamTokens[index] || '')
                      const known = options.includes(value)
                      const usePicker = options.length >= VALUE_PICKER_THRESHOLD

                      return (
                        <div className={styles.paramRow} key={`binding-param-${index}`}>
                          <label>{label}</label>
                          {options.length > 0 && !usePicker ? (
                            <>
                              <select
                                aria-label={`binding-param-${index}`}
                                value={known ? value : '__custom__'}
                                onChange={event => {
                                  const next = event.target.value
                                  if (next === '__custom__') {
                                    return
                                  }
                                  setKnownBehaviorParam(index, next)
                                }}
                              >
                                {options.map(option => (
                                  <option key={`binding-param-option-${index}-${option}`} value={option}>{option}</option>
                                ))}
                                <option value='__custom__'>Custom</option>
                              </select>
                              {!known && (
                                <input
                                  type='text'
                                  aria-label={`binding-param-custom-${index}`}
                                  value={value}
                                  onChange={event => setKnownBehaviorParam(index, event.target.value)}
                                />
                              )}
                            </>
                          ) : (
                            <>
                              {usePicker ? (
                                <button
                                  type='button'
                                  className={styles.paramPickerButton}
                                  aria-label={`binding-param-${index}`}
                                  onClick={() => {
                                    setParamPicker({
                                      index,
                                      spec,
                                      value,
                                      behavior: selectedBehaviorDefinition,
                                      choices: pickerChoices
                                    })
                                  }}
                                >
                                  {value || '(select)'}
                                </button>
                              ) : (
                                <input
                                  type='text'
                                  aria-label={`binding-param-${index}`}
                                  value={value}
                                  onChange={event => setKnownBehaviorParam(index, event.target.value)}
                                />
                              )}
                            </>
                          )}
                          {usePicker && paramPicker?.index === index && (
                            <div className={styles.paramPicker}>
                              <ValuePicker
                                target={{}}
                                value={String(paramPicker.value || '')}
                                param={{ type: 'raw', name: label }}
                                currentNode={{ value: paramPicker.value || '', params: [] }}
                                choices={paramPicker.choices}
                                prompt={`Select ${label}`}
                                searchKey='code'
                                onSelect={choice => {
                                  const next = String(choice?.code ?? choice?.value ?? '').trim()
                                  setKnownBehaviorParam(index, next)
                                  setParamPicker(null)
                                }}
                                onCancel={() => setParamPicker(null)}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div
              className={styles.formRow}
              data-changed={isFieldChanged(selectedCombo.properties['timeout-ms'], selectedBaseCombo?.properties?.['timeout-ms']) ? 'true' : 'false'}
            >
              <label>timeout-ms</label>
              <input
                type='number'
                aria-label='timeout-ms'
                min='0'
                step='1'
                value={selectedCombo.properties['timeout-ms']}
                onChange={event => setInteger('timeout-ms', event.target.value)}
              />
            </div>

            <div
              className={styles.formRow}
              data-changed={isFieldChanged(
                selectedCombo.properties['require-prior-idle-ms'],
                selectedBaseCombo?.properties?.['require-prior-idle-ms']
              ) ? 'true' : 'false'}
            >
              <label>require-prior-idle-ms</label>
              <input
                type='number'
                aria-label='require-prior-idle-ms'
                min='0'
                step='1'
                value={selectedCombo.properties['require-prior-idle-ms']}
                onChange={event => setInteger('require-prior-idle-ms', event.target.value)}
              />
            </div>

            <div
              className={styles.formRow}
              data-changed={isFieldChanged(
                selectedCombo.properties['slow-release'],
                selectedBaseCombo?.properties?.['slow-release']
              ) ? 'true' : 'false'}
            >
              <label>slow-release</label>
              <input
                type='checkbox'
                className={styles.slowReleaseCheckbox}
                checked={Boolean(selectedCombo.properties['slow-release'])}
                onChange={event => {
                  updateSelectedCombo(current => {
                    const next = cloneComboNode(current)
                    next.properties['slow-release'] = event.target.checked
                    next.property_types['slow-release'] = 'boolean'
                    if (!next.property_order.includes('slow-release')) {
                      next.property_order.push('slow-release')
                    }
                    return next
                  })
                }}
              />
            </div>

            <div
              className={styles.formRow}
              data-changed={isFieldChanged(selectedCombo.properties.layers, selectedBaseCombo?.properties?.layers) ? 'true' : 'false'}
            >
              <label>layers</label>
              <input
                type='text'
                aria-label='layers'
                value={renderIntegerArrayValue(selectedCombo.properties.layers)}
                placeholder='0 1'
                onChange={event => setTokenArray('layers', event.target.value)}
              />
            </div>

            <div
              className={styles.group}
              data-changed={isFieldChanged(
                selectedCombo.properties['key-positions'],
                selectedBaseCombo?.properties?.['key-positions']
              ) ? 'true' : 'false'}
            >
              <div className={styles.groupTitle}>key-positions</div>
              <input
                type='text'
                aria-label='key-positions'
                value={renderIntegerArrayValue(selectedPositions)}
                placeholder='0 1'
                onChange={event => setTokenArray('key-positions', event.target.value)}
              />

              {Array.isArray(layout) && layout.length > 0 && (
                <div
                  className={styles.keyboardMap}
                  style={{ width: `${keyBounds.width}px`, height: `${keyBounds.height}px` }}
                >
                  {layout.map((key, index) => {
                    const keyStyle = getKeyStyles(
                      { x: key.x, y: key.y },
                      { u: key.u || key.w || 1, h: key.h || 1 },
                      { x: key.rx, y: key.ry, a: key.r }
                    )
                    const selected = selectedPositions.includes(index)

                    return (
                      <button
                        key={`combo-key-${index}`}
                        type='button'
                        className={styles.keyButton}
                        style={keyStyle}
                        data-selected={selected ? 'true' : 'false'}
                        onClick={() => {
                          const nextPositions = selected
                            ? selectedPositions.filter(item => item !== index)
                            : [...selectedPositions, index].sort((a, b) => a - b)
                          setTokenArray('key-positions', renderIntegerArrayValue(nextPositions))
                        }}
                        title={`Key ${index}`}
                      >
                        {key.label || index}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

ComboEditor.propTypes = {
  baseKeymap: PropTypes.object,
  keymap: PropTypes.object.isRequired,
  layout: PropTypes.array,
  availableBehaviours: PropTypes.array,
  keycodes: PropTypes.array,
  onUpdate: PropTypes.func.isRequired
}

ComboEditor.defaultProps = {
  layout: [],
  availableBehaviours: [],
  keycodes: []
}

export default ComboEditor
