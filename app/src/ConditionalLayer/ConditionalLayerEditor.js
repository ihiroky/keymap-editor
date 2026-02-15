import isEqual from 'lodash/isEqual'
import PropTypes from 'prop-types'
import { useEffect, useMemo, useState } from 'react'

import { getListChangeInfo, isAddedIndex } from '../shared/change-tracking'
import styles from './styles.module.css'

const KNOWN_PROPERTY_KEYS = [
  'if-layers',
  'then-layer'
]

const KNOWN_PROPERTY_TYPES = {
  'if-layers': 'token-array',
  'then-layer': 'int'
}

function cloneRuleNode (node) {
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
  return noLeadingDigits || 'conditional_layer'
}

function nextName (existingNames) {
  const set = new Set(existingNames.map(item => String(item || '')))
  if (!set.has('conditional_layer')) {
    return 'conditional_layer'
  }

  for (let i = 2; i < 9999; i += 1) {
    const candidate = `conditional_layer_${i}`
    if (!set.has(candidate)) {
      return candidate
    }
  }

  return `conditional_layer_${Date.now()}`
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

function getLayerLabel (index, layerNames) {
  const name = String(layerNames[index] || '').trim()
  return name || `Layer ${index}`
}

function buildLayerChoices (layerNames, layerCount) {
  return Array.from({ length: Math.max(0, layerCount) }, (_, index) => ({
    value: index,
    label: getLayerLabel(index, layerNames)
  }))
}

function ensureLayerChoice (choices, value) {
  const layer = toNonNegativeInteger(value)
  if (layer === null || choices.some(choice => choice.value === layer)) {
    return choices
  }

  return [
    ...choices,
    { value: layer, label: `${layer} (invalid)` }
  ]
}

function normalizeIfLayersAndThenLayer (ifLayers, thenLayer, layerCount) {
  const seen = new Set()
  const normalizedIfLayers = []

  for (const rawLayer of Array.isArray(ifLayers) ? ifLayers : []) {
    const layer = toNonNegativeInteger(rawLayer)
    if (layer === null || seen.has(layer)) {
      continue
    }
    seen.add(layer)
    normalizedIfLayers.push(layer)
  }

  let normalizedThenLayer = toNonNegativeInteger(thenLayer)
  if (normalizedThenLayer === null) {
    normalizedThenLayer = layerCount > 2 ? 2 : layerCount > 1 ? 1 : 0
  }

  const repairedIfLayers = normalizedIfLayers.filter(layer => layer !== normalizedThenLayer)
  const used = new Set(repairedIfLayers)
  for (let index = 0; index < Math.max(layerCount, 0) && repairedIfLayers.length < 2; index += 1) {
    if (index === normalizedThenLayer || used.has(index)) {
      continue
    }
    used.add(index)
    repairedIfLayers.push(index)
  }

  return {
    ifLayers: repairedIfLayers,
    thenLayer: normalizedThenLayer
  }
}

function toNonNegativeInteger (value) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0) {
    return null
  }
  return number
}

function normalizeRuleNode (node, layerCount) {
  const defaults = {
    'if-layers': [0, 1],
    'then-layer': layerCount > 2 ? 2 : layerCount > 1 ? 1 : 0
  }

  const properties = node?.properties && typeof node.properties === 'object'
    ? { ...node.properties }
    : {}
  const propertyTypes = node?.property_types && typeof node.property_types === 'object'
    ? { ...node.property_types }
    : {}
  const propertyOrder = Array.isArray(node?.property_order)
    ? [...node.property_order]
    : []

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

  const ifLayerSource = Array.isArray(properties['if-layers'])
    ? properties['if-layers'].join(' ')
    : properties['if-layers']
  const ifLayers = parseIntegerArrayInput(ifLayerSource)
  const normalized = normalizeIfLayersAndThenLayer(
    ifLayers.valid ? ifLayers.value : [],
    properties['then-layer'],
    layerCount
  )
  properties['if-layers'] = normalized.ifLayers
  properties['then-layer'] = normalized.thenLayer

  const name = sanitizeName(node?.name || '')
  return {
    ...node,
    name,
    bind: node?.bind || `&${name}`,
    properties,
    property_types: propertyTypes,
    property_order: propertyOrder,
    children: Array.isArray(node?.children) ? node.children : []
  }
}

function validateConditionalLayerCollection (rules, layerCount) {
  const errors = []
  const names = rules.map(node => String(node?.name || '')).filter(Boolean)
  const duplicated = names.filter((name, index) => names.indexOf(name) !== index)

  rules.forEach((node, index) => {
    const ref = `Conditional layer ${index + 1}`
    const name = String(node?.name || '').trim()
    if (!name || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)) {
      errors.push(`${ref}: name must match ^[A-Za-z_][A-Za-z0-9_-]*$`)
    }

    const ifLayersRaw = Array.isArray(node?.properties?.['if-layers'])
      ? node.properties['if-layers']
      : []
    if (ifLayersRaw.length < 2) {
      errors.push(`${ref}: if-layers must contain at least two layers`)
    }

    const ifLayerSet = new Set()
    for (const rawLayer of ifLayersRaw) {
      const layer = toNonNegativeInteger(rawLayer)
      if (layer === null) {
        errors.push(`${ref}: if-layers must contain non-negative integers`)
        break
      }
      if (layerCount > 0 && layer >= layerCount) {
        errors.push(`${ref}: if-layer ${layer} is out of range`)
      }
      if (ifLayerSet.has(layer)) {
        errors.push(`${ref}: if-layers must not contain duplicates`)
      }
      ifLayerSet.add(layer)
    }

    const thenLayer = toNonNegativeInteger(node?.properties?.['then-layer'])
    if (thenLayer === null) {
      errors.push(`${ref}: then-layer must be a non-negative integer`)
    } else {
      if (layerCount > 0 && thenLayer >= layerCount) {
        errors.push(`${ref}: then-layer ${thenLayer} is out of range`)
      }
      if (ifLayerSet.has(thenLayer)) {
        errors.push(`${ref}: then-layer must not be included in if-layers`)
      }
    }
  })

  for (const name of [...new Set(duplicated)]) {
    errors.push(`Duplicate conditional layer name: ${name}`)
  }

  return errors
}

function ConditionalLayerEditor (props) {
  const { keymap, baseKeymap, onUpdate } = props
  const layerNames = Array.isArray(keymap?.layer_names) ? keymap.layer_names : []
  const layerCount = Array.isArray(keymap?.layers) ? keymap.layers.length : 0
  const layerChoices = useMemo(() => buildLayerChoices(layerNames, layerCount), [layerNames, layerCount])

  const baseRules = useMemo(() => (
    Array.isArray(baseKeymap?.conditional_layers)
      ? baseKeymap.conditional_layers.map(node => normalizeRuleNode(node, layerCount))
      : []
  ), [baseKeymap, layerCount])
  const rules = useMemo(() => (
    Array.isArray(keymap?.conditional_layers)
      ? keymap.conditional_layers.map(node => normalizeRuleNode(node, layerCount))
      : []
  ), [keymap, layerCount])
  const ruleChangeInfo = useMemo(() => (
    getListChangeInfo(baseRules, rules)
  ), [baseRules, rules])

  const [selection, setSelection] = useState(() => (rules.length > 0 ? 0 : null))
  const [localErrors, setLocalErrors] = useState([])

  useEffect(() => {
    if (selection === null) {
      if (rules.length > 0) {
        setSelection(0)
      }
      return
    }

    if (!rules[selection]) {
      setSelection(rules.length > 0 ? rules.length - 1 : null)
    }
  }, [selection, rules])

  const persistedErrors = useMemo(() => (
    validateConditionalLayerCollection(rules, layerCount)
  ), [rules, layerCount])

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

  const selectedRule = useMemo(() => {
    if (selection === null) {
      return null
    }

    return rules[selection] || null
  }, [selection, rules])
  const selectedBaseRule = useMemo(() => {
    if (selection === null) {
      return null
    }

    return baseRules[selection] || null
  }, [selection, baseRules])

  const commitRules = updater => {
    const nextRules = updater(rules.map(cloneRuleNode))
    const errors = validateConditionalLayerCollection(nextRules, layerCount)
    if (errors.length > 0) {
      setLocalErrors(errors)
      return false
    }

    setLocalErrors([])
    onUpdate({
      ...keymap,
      conditional_layers: nextRules
    })
    return true
  }

  const updateSelectedRule = updater => {
    if (selection === null) {
      return
    }

    commitRules(list => {
      const next = [...list]
      const current = next[selection]
      if (!current) {
        return list
      }

      next[selection] = updater(cloneRuleNode(current))
      return next
    })
  }

  const addRule = () => {
    if (layerCount < 3) {
      setLocalErrors(['At least three layers are required to add conditional layers'])
      return
    }

    const existingNames = rules.map(rule => rule?.name).filter(Boolean)
    const name = nextName(existingNames)
    const node = {
      label: null,
      name,
      bind: `&${name}`,
      properties: {
        'if-layers': [0, 1],
        'then-layer': 2
      },
      property_types: {
        'if-layers': 'token-array',
        'then-layer': 'int'
      },
      property_order: [...KNOWN_PROPERTY_KEYS],
      children: []
    }

    const updated = commitRules(list => [...list, node])
    if (updated) {
      setSelection(rules.length)
    }
  }

  const removeSelected = () => {
    if (selection === null) {
      return
    }

    commitRules(list => list.filter((_, index) => index !== selection))
  }

  const setIfLayerAt = (ifLayerIndex, rawValue) => {
    const value = toNonNegativeInteger(rawValue)
    if (value === null) {
      setLocalErrors(['if-layers must contain non-negative integers'])
      return
    }

    updateSelectedRule(current => {
      const next = cloneRuleNode(current)
      const source = Array.isArray(next.properties['if-layers'])
        ? [...next.properties['if-layers']]
        : []
      source[ifLayerIndex] = value
      next.properties['if-layers'] = source
      next.property_types['if-layers'] = 'token-array'
      if (!next.property_order.includes('if-layers')) {
        next.property_order.push('if-layers')
      }
      return next
    })
  }

  const addIfLayer = () => {
    if (!selectedRule) {
      return
    }

    const current = Array.isArray(selectedRule.properties['if-layers'])
      ? selectedRule.properties['if-layers']
      : []
    const thenLayer = toNonNegativeInteger(selectedRule.properties['then-layer'])
    const used = new Set(current)
    const available = layerChoices
      .map(choice => choice.value)
      .find(value => !used.has(value) && value !== thenLayer)

    if (!Number.isInteger(available)) {
      setLocalErrors(['No remaining layer is available for if-layers'])
      return
    }

    updateSelectedRule(node => {
      const next = cloneRuleNode(node)
      const source = Array.isArray(next.properties['if-layers'])
        ? [...next.properties['if-layers']]
        : []
      source.push(available)
      next.properties['if-layers'] = source
      next.property_types['if-layers'] = 'token-array'
      if (!next.property_order.includes('if-layers')) {
        next.property_order.push('if-layers')
      }
      return next
    })
  }

  const removeIfLayerAt = ifLayerIndex => {
    updateSelectedRule(current => {
      const next = cloneRuleNode(current)
      const source = Array.isArray(next.properties['if-layers'])
        ? [...next.properties['if-layers']]
        : []
      next.properties['if-layers'] = source.filter((_, index) => index !== ifLayerIndex)
      next.property_types['if-layers'] = 'token-array'
      if (!next.property_order.includes('if-layers')) {
        next.property_order.push('if-layers')
      }
      return next
    })
  }

  const setThenLayer = rawValue => {
    const value = toNonNegativeInteger(rawValue)
    if (value === null) {
      setLocalErrors(['then-layer must be a non-negative integer'])
      return
    }

    updateSelectedRule(current => {
      const next = cloneRuleNode(current)
      next.properties['then-layer'] = value
      next.property_types['then-layer'] = 'int'
      if (!next.property_order.includes('then-layer')) {
        next.property_order.push('then-layer')
      }
      return next
    })
  }

  const selectedIfLayers = Array.isArray(selectedRule?.properties?.['if-layers'])
    ? selectedRule.properties['if-layers']
    : []
  const selectedThenLayer = toNonNegativeInteger(selectedRule?.properties?.['then-layer'])
  const thenLayerValue = selectedThenLayer === null ? '' : String(selectedThenLayer)
  const thenLayerChoices = ensureLayerChoice(
    layerChoices.filter(choice => !selectedIfLayers.includes(choice.value)),
    selectedThenLayer
  )
  const canAddIfLayer = layerChoices.some(choice => (
    !selectedIfLayers.includes(choice.value) && choice.value !== selectedThenLayer
  ))

  return (
    <div className={styles.editor}>
      <div className={styles.sidebar}>
        <div className={styles.sectionHeader}>Conditional Layers</div>
        {(ruleChangeInfo.addedCount > 0 || ruleChangeInfo.deletedCount > 0) && (
          <div className={styles.changeSummary}>+{ruleChangeInfo.addedCount} / Deleted {ruleChangeInfo.deletedCount}</div>
        )}
        <div className={styles.list}>
          {rules.map((rule, index) => (
            <button
              type='button'
              key={`conditional-layer-${index}`}
              className={styles.listItem}
              data-selected={selection === index ? 'true' : 'false'}
              data-changed={ruleChangeInfo.changedIndices.has(index) ? 'true' : 'false'}
              onClick={() => setSelection(index)}
            >
              {ruleChangeInfo.changedIndices.has(index) && <span className={styles.diffDot} aria-hidden='true' />}
              {rule.name}
              {isAddedIndex(baseRules, index) && <span className={styles.addedBadge}>Added</span>}
            </button>
          ))}
        </div>

        <div className={styles.actions}>
          <button type='button' onClick={addRule} disabled={layerCount < 3}>Add Rule</button>
          <button type='button' onClick={removeSelected} disabled={selection === null}>Delete Selected</button>
        </div>
      </div>

      <div className={styles.panel}>
        {visibleErrors.length > 0 && (
          <div className={styles.errors}>
            {visibleErrors.map((error, index) => (
              <div key={`conditional-layer-error-${index}`}>{error}</div>
            ))}
          </div>
        )}

        {!selectedRule && (
          <p>Select or create a conditional layer rule.</p>
        )}

        {selectedRule && (
          <>
            <div
              className={styles.formRow}
              data-changed={selectedRule.name !== selectedBaseRule?.name ? 'true' : 'false'}
            >
              <label>Name</label>
              <input
                type='text'
                value={selectedRule.name || ''}
                onChange={event => {
                  const name = sanitizeName(event.target.value)
                  updateSelectedRule(current => {
                    const next = cloneRuleNode(current)
                    next.name = name
                    next.bind = `&${name}`
                    return next
                  })
                }}
              />
            </div>

            <div
              className={styles.formRow}
              data-changed={!isEqual(selectedIfLayers, selectedBaseRule?.properties?.['if-layers'] || []) ? 'true' : 'false'}
            >
              <label>if-layers</label>
              <div className={styles.ifLayersEditor}>
                {selectedIfLayers.map((ifLayer, ifLayerIndex) => {
                  const rowChoices = ensureLayerChoice(
                    layerChoices.filter(choice => (
                      choice.value === ifLayer || choice.value !== selectedThenLayer
                    )),
                    ifLayer
                  )
                  return (
                    <div key={`if-layer-row-${ifLayerIndex}`} className={styles.ifLayerRow}>
                      <select
                        aria-label={`if-layer-${ifLayerIndex}`}
                        value={String(ifLayer)}
                        onChange={event => setIfLayerAt(ifLayerIndex, event.target.value)}
                      >
                        {rowChoices.map(choice => (
                          <option key={`if-layer-option-${ifLayerIndex}-${choice.value}`} value={choice.value}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type='button'
                        className={styles.ifLayerRemoveButton}
                        aria-label={`remove-if-layer-${ifLayerIndex}`}
                        onClick={() => removeIfLayerAt(ifLayerIndex)}
                        disabled={selectedIfLayers.length <= 2}
                      >
                        Remove
                      </button>
                    </div>
                  )
                })}
                <button
                  type='button'
                  className={styles.ifLayerAddButton}
                  aria-label='add-if-layer'
                  onClick={addIfLayer}
                  disabled={!canAddIfLayer || layerChoices.length === 0}
                >
                  Add if-layer
                </button>
              </div>
            </div>

            <div
              className={styles.formRow}
              data-changed={!isEqual(selectedThenLayer, toNonNegativeInteger(selectedBaseRule?.properties?.['then-layer'])) ? 'true' : 'false'}
            >
              <label>then-layer</label>
              <select
                aria-label='then-layer'
                value={thenLayerValue}
                disabled={thenLayerChoices.length === 0}
                onChange={event => setThenLayer(event.target.value)}
              >
                {thenLayerChoices.map(choice => (
                  <option key={`then-layer-option-${choice.value}`} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

ConditionalLayerEditor.propTypes = {
  baseKeymap: PropTypes.object,
  keymap: PropTypes.object.isRequired,
  onUpdate: PropTypes.func.isRequired
}

export default ConditionalLayerEditor
