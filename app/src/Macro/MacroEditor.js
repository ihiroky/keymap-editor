import cloneDeep from 'lodash/cloneDeep'
import isEqual from 'lodash/isEqual'
import PropTypes from 'prop-types'
import { useEffect, useMemo, useState } from 'react'

import Icon from '../Common/Icon'
import styles from './styles.module.css'
import {
  getListChangeInfo,
  isAddedIndex,
  isIndexAdded,
  isIndexChanged,
  revertItemByIndex
} from '../shared/change-tracking'

import {
  MACRO_BINDING_CELLS,
  MACRO_COMPATIBLES,
  MACRO_MODE_CONTROLS,
  MACRO_TIME_CONTROLS,
  MACRO_PARAM_FORWARD_CONTROLS,
  cloneDefinition,
  ensureBindingArray,
  getMissingMacroTypes,
  getMacroTypeMap,
  parseMacroBinding,
  parseRawMacroBindings,
  renderMacroBinding,
  renderRawMacroBindings,
  validateMacroCollection
} from '../shared/zmk/macro-helpers'

function sanitizeLabel (label) {
  const cleaned = String(label || '')
    .trim()
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^_+/, '')

  return cleaned || 'macro'
}

function nextLabel (existing, hint) {
  const base = sanitizeLabel(hint || 'macro')
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

function parseOptionalNonNegativeInt (value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) {
    return { value: undefined, valid: true }
  }

  const asNumber = Number(trimmed)
  if (!Number.isInteger(asNumber) || asNumber < 0) {
    return { value: null, valid: false }
  }

  return { value: asNumber, valid: true }
}

function normalizeStoredPropertyType (specType) {
  const map = {
    int: 'int',
    string: 'string',
    token: 'token',
    bindings: 'bindings',
    'token-array': 'token-array',
    boolean: 'boolean'
  }

  return map[specType] || 'raw'
}

function ensurePropertyOrder (node, key) {
  if (!node.property_order.includes(key)) {
    node.property_order.push(key)
  }
}

function buildMacroNode (label, compatible) {
  const bindingCells = MACRO_BINDING_CELLS[compatible]

  return {
    label,
    name: `${label}_node`,
    bind: `&${label}`,
    compatible,
    properties: {
      compatible,
      '#binding-cells': bindingCells,
      bindings: ['&none']
    },
    property_types: {
      compatible: 'string',
      '#binding-cells': 'int',
      bindings: 'bindings'
    },
    property_order: ['compatible', '#binding-cells', 'bindings'],
    children: []
  }
}

function MacroEditor (props) {
  const { keymap, baseKeymap, behaviorTypes, availableBehaviours, onUpdate } = props

  const baseMacroDefinitions = useMemo(() => (
    Array.isArray(baseKeymap?.behavior_definitions) ? baseKeymap.behavior_definitions : []
  ), [baseKeymap])
  const macroDefinitions = useMemo(() => (
    Array.isArray(keymap.behavior_definitions) ? keymap.behavior_definitions : []
  ), [keymap])
  const macroChangeInfo = useMemo(() => (
    getListChangeInfo(baseMacroDefinitions, macroDefinitions)
  ), [baseMacroDefinitions, macroDefinitions])

  const macroTypeMap = useMemo(() => getMacroTypeMap(behaviorTypes), [behaviorTypes])
  const missingMacroTypes = useMemo(() => getMissingMacroTypes(behaviorTypes), [behaviorTypes])
  const macroTypeChoices = useMemo(() => (
    MACRO_COMPATIBLES
      .map(compatible => macroTypeMap[compatible])
      .filter(Boolean)
      .map(type => ({
        compatible: type.compatible,
        label: `${type.displayName} (${type.compatible})`
      }))
  ), [macroTypeMap])

  const behaviourChoices = useMemo(() => {
    const map = new Map()

    for (const behaviour of availableBehaviours || []) {
      const code = String(behaviour?.code || '').trim()
      if (!code || code.startsWith('&macro_')) {
        continue
      }

      if (!map.has(code)) {
        map.set(code, {
          code,
          name: behaviour.name || code
        })
      }
    }

    if (!map.has('&none')) {
      map.set('&none', { code: '&none', name: 'None' })
    }

    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code))
  }, [availableBehaviours])

  const [selection, setSelection] = useState(() => (macroDefinitions.length > 0 ? 0 : null))
  const [rawMode, setRawMode] = useState(false)
  const [rawDraft, setRawDraft] = useState('')
  const [dragIndex, setDragIndex] = useState(null)
  const [localErrors, setLocalErrors] = useState([])

  useEffect(() => {
    if (selection === null) {
      if (macroDefinitions.length > 0) {
        setSelection(0)
      }
      return
    }

    if (!macroDefinitions[selection]) {
      setSelection(macroDefinitions.length > 0 ? macroDefinitions.length - 1 : null)
    }
  }, [selection, macroDefinitions])

  const selectedNode = useMemo(() => {
    if (selection === null) {
      return null
    }

    return macroDefinitions[selection] || null
  }, [macroDefinitions, selection])
  const selectedBaseNode = useMemo(() => {
    if (selection === null) {
      return null
    }

    return baseMacroDefinitions[selection] || null
  }, [baseMacroDefinitions, selection])

  const selectedBindings = useMemo(() => ensureBindingArray(selectedNode?.properties?.bindings), [selectedNode])
  const selectedBaseBindings = useMemo(() => ensureBindingArray(selectedBaseNode?.properties?.bindings), [selectedBaseNode])
  const selectedSteps = useMemo(() => selectedBindings.map(parseMacroBinding), [selectedBindings])
  const selectedCompatible = selectedNode?.properties?.compatible || selectedNode?.compatible || ''
  const selectedBindingCells = Number(selectedNode?.properties?.['#binding-cells'])
  const selectedType = useMemo(() => (
    selectedCompatible ? macroTypeMap[selectedCompatible] || null : null
  ), [selectedCompatible, macroTypeMap])
  const selectedSpecMap = useMemo(() => (
    selectedType?.propertySpecs && typeof selectedType.propertySpecs === 'object'
      ? selectedType.propertySpecs
      : {}
  ), [selectedType])
  const requiredPropertyKeys = useMemo(() => {
    const fromSpecs = Object.keys(selectedSpecMap).filter(key => selectedSpecMap[key]?.required === true)

    if (fromSpecs.length > 0) {
      return fromSpecs
    }

    return ['compatible', '#binding-cells', 'bindings']
  }, [selectedSpecMap])
  const optionalKnownKeys = useMemo(() => {
    const dynamicOptional = Object.keys(selectedSpecMap).filter(key => !requiredPropertyKeys.includes(key))
    const result = ['label', ...dynamicOptional]
    return [...new Set(result)]
  }, [selectedSpecMap, requiredPropertyKeys])
  const optionalKnownPresentKeys = useMemo(() => (
    optionalKnownKeys.filter(key => Object.prototype.hasOwnProperty.call(selectedNode?.properties || {}, key))
  ), [optionalKnownKeys, selectedNode])
  const optionalKnownMissingKeys = useMemo(() => (
    optionalKnownKeys.filter(key => !optionalKnownPresentKeys.includes(key))
  ), [optionalKnownKeys, optionalKnownPresentKeys])

  useEffect(() => {
    setRawDraft(renderRawMacroBindings(selectedBindings))
  }, [selectedBindings, selection])

  const persistedErrors = useMemo(() => validateMacroCollection(macroDefinitions), [macroDefinitions])

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

  const commitDefinitions = updater => {
    const nextDefinitions = updater(cloneDeep(macroDefinitions))
    const errors = validateMacroCollection(nextDefinitions)
    if (errors.length > 0) {
      setLocalErrors(errors)
      return false
    }

    setLocalErrors([])
    onUpdate({
      ...keymap,
      behavior_definitions: nextDefinitions
    })
    return true
  }

  const updateSelectedNode = updater => {
    if (selection === null) {
      return
    }

    commitDefinitions(definitions => {
      const next = [...definitions]
      const current = next[selection]
      if (!current) {
        return definitions
      }

      next[selection] = updater(cloneDefinition(current))
      return next
    })
  }

  const updateSelectedBindings = updater => {
    updateSelectedNode(current => {
      const bindings = ensureBindingArray(current.properties?.bindings)
      const nextBindings = updater(bindings)

      const next = cloneDefinition(current)
      next.properties.bindings = nextBindings
      next.property_types.bindings = 'bindings'
      ensurePropertyOrder(next, 'bindings')
      return next
    })
  }

  const setOptionalKnownProperty = (key, value, specType = 'raw') => {
    updateSelectedNode(current => {
      const next = cloneDefinition(current)
      next.properties[key] = value
      next.property_types[key] = normalizeStoredPropertyType(specType)
      ensurePropertyOrder(next, key)
      return next
    })
  }

  const removeOptionalKnownProperty = key => {
    updateSelectedNode(current => {
      const next = cloneDefinition(current)
      delete next.properties[key]
      delete next.property_types[key]
      next.property_order = next.property_order.filter(entry => entry !== key)
      return next
    })
  }

  const addOptionalKnownProperty = key => {
    const spec = selectedSpecMap[key]
    if (key === 'label') {
      setOptionalKnownProperty(key, '', 'string')
      return
    }

    if (Object.prototype.hasOwnProperty.call(spec || {}, 'default')) {
      setOptionalKnownProperty(key, spec.default, spec.type)
      return
    }

    if ((spec?.type || '') === 'int') {
      setOptionalKnownProperty(key, 0, 'int')
      return
    }

    if ((spec?.type || '') === 'boolean') {
      setOptionalKnownProperty(key, false, 'boolean')
      return
    }

    if ((spec?.type || '') === 'bindings' || (spec?.type || '') === 'token-array') {
      setOptionalKnownProperty(key, [], spec.type)
      return
    }

    setOptionalKnownProperty(key, '', spec?.type || 'string')
  }

  const addMacro = () => {
    const firstCompatible = MACRO_COMPATIBLES.find(compatible => Boolean(macroTypeMap[compatible]))
    if (!firstCompatible) {
      return
    }

    const used = macroDefinitions.map(node => node?.label).filter(Boolean)
    const label = nextLabel(used, 'macro')
    const node = buildMacroNode(label, firstCompatible)

    commitDefinitions(definitions => [...definitions, node])
    setSelection(macroDefinitions.length)
  }

  const removeSelected = () => {
    if (selection === null) {
      return
    }

    commitDefinitions(definitions => definitions.filter((_, index) => index !== selection))
  }

  const discardMacroAt = index => {
    const reverted = revertItemByIndex(baseMacroDefinitions, macroDefinitions, index)
    setLocalErrors([])
    onUpdate({
      ...keymap,
      behavior_definitions: reverted
    })
  }

  const applyRaw = () => {
    const parsed = parseRawMacroBindings(rawDraft)
    const success = commitDefinitions(definitions => {
      const next = [...definitions]
      const current = next[selection]
      if (!current) {
        return definitions
      }

      const updated = cloneDefinition(current)
      updated.properties.bindings = parsed
      updated.property_types.bindings = 'bindings'
      ensurePropertyOrder(updated, 'bindings')
      next[selection] = updated
      return next
    })

    if (success) {
      setRawDraft(renderRawMacroBindings(parsed))
    }
  }

  const onDropRow = targetIndex => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null)
      return
    }

    updateSelectedBindings(bindings => {
      const next = [...bindings]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })

    setDragIndex(null)
  }

  if (missingMacroTypes.length > 0) {
    return (
      <div className={styles.editor}>
        <div className={styles.panel}>
          <div className={styles.errors}>
            Missing macro type definitions: {missingMacroTypes.join(', ')}
          </div>
          <p>Update API behavior-types data and reload this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.editor}>
      <div className={styles.sidebar}>
        <div className={styles.sectionHeader}>Macro Definitions</div>
        {(macroChangeInfo.addedCount > 0 || macroChangeInfo.deletedCount > 0) && (
          <div className={styles.changeSummary}>+{macroChangeInfo.addedCount} / Deleted {macroChangeInfo.deletedCount}</div>
        )}
        <div className={styles.list}>
          {macroDefinitions.map((node, index) => (
            <div key={`macro-${index}`} className={styles.listRow}>
              <button
                type="button"
                className={styles.listItem}
                data-selected={selection === index ? 'true' : 'false'}
                data-changed={macroChangeInfo.changedIndices.has(index) ? 'true' : 'false'}
                onClick={() => setSelection(index)}
              >
                {macroChangeInfo.changedIndices.has(index) && <span className={styles.diffDot} aria-hidden='true' />}
                {node.label ? `&${node.label}` : node.name}
                {isAddedIndex(baseMacroDefinitions, index) && <span className={styles.addedBadge}>Added</span>}
              </button>
              {isIndexChanged(baseMacroDefinitions, macroDefinitions, index) && (
                <button
                  type="button"
                  className={styles.revertButton}
                  aria-label={`Discard macro changes ${node.label || node.name || index + 1}`}
                  title='Discard macro changes'
                  onClick={() => discardMacroAt(index)}
                >
                  <Icon name='undo' />
                  {isIndexAdded(index, baseMacroDefinitions.length) ? 'Remove' : 'Discard'}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className={styles.actions}>
          <button type="button" onClick={addMacro}>Add Macro</button>
          <button type="button" onClick={removeSelected} disabled={selection === null}>Delete Selected</button>
        </div>
      </div>

      <div className={styles.panel}>
        {visibleErrors.length > 0 && (
          <div className={styles.errors}>
            {visibleErrors.map((error, index) => (
              <div key={`macro-error-${index}`}>{error}</div>
            ))}
          </div>
        )}

        {!selectedNode && (
          <p>Select or create a macro definition.</p>
        )}

        {selectedNode && (
          <>
            <div className={styles.group}>
              <div className={styles.groupTitle}>Required Properties</div>

              <div className={styles.formRow} data-changed={!isEqual(selectedNode.label, selectedBaseNode?.label) ? 'true' : 'false'}>
                <label>Label</label>
                <input
                  type="text"
                  value={selectedNode.label || ''}
                  onChange={event => {
                    const label = sanitizeLabel(event.target.value)
                    updateSelectedNode(current => {
                      const next = cloneDefinition(current)
                      next.label = label
                      next.bind = `&${label}`
                      if (!next.name || next.name.startsWith('&')) {
                        next.name = `${label}_node`
                      }
                      return next
                    })
                  }}
                />
              </div>

              <div className={styles.formRow} data-changed={!isEqual(selectedNode.name, selectedBaseNode?.name) ? 'true' : 'false'}>
                <label>Node Name</label>
                <input
                  type="text"
                  value={selectedNode.name || ''}
                  onChange={event => {
                    const value = event.target.value
                    updateSelectedNode(current => {
                      const next = cloneDefinition(current)
                      next.name = value
                      return next
                    })
                  }}
                />
              </div>

              <div
                className={styles.formRow}
                data-changed={!isEqual(selectedCompatible, selectedBaseNode?.properties?.compatible || selectedBaseNode?.compatible || '') ? 'true' : 'false'}
              >
                <label>Compatible</label>
                <select
                  aria-label='Compatible'
                  value={selectedCompatible}
                  onChange={event => {
                    const compatible = event.target.value
                    const bindingCells = MACRO_BINDING_CELLS[compatible]

                    updateSelectedNode(current => {
                      const next = cloneDefinition(current)
                      next.compatible = compatible
                      next.properties.compatible = compatible
                      next.properties['#binding-cells'] = bindingCells
                      next.property_types.compatible = 'string'
                      next.property_types['#binding-cells'] = 'int'
                      ensurePropertyOrder(next, 'compatible')
                      ensurePropertyOrder(next, '#binding-cells')
                      return next
                    })
                  }}
                >
                  {macroTypeChoices.map(choice => (
                    <option key={choice.compatible} value={choice.compatible}>{choice.label}</option>
                  ))}
                </select>
              </div>

              <div
                className={styles.formRow}
                data-changed={!isEqual(selectedBindingCells, Number(selectedBaseNode?.properties?.['#binding-cells'])) ? 'true' : 'false'}
              >
                <label>#binding-cells</label>
                <input type="number" disabled value={Number.isInteger(selectedBindingCells) ? selectedBindingCells : ''} />
              </div>

              <div className={styles.modeSwitch}>
                <button
                  type="button"
                  data-active={rawMode ? 'false' : 'true'}
                  onClick={() => setRawMode(false)}
                >
                  Structured
                </button>
                <button
                  type="button"
                  data-active={rawMode ? 'true' : 'false'}
                  onClick={() => setRawMode(true)}
                >
                  Raw
                </button>
              </div>

              {!rawMode && (
                <div className={styles.group}>
                  <div className={styles.groupTitle}>Bindings (steps)</div>

                  {selectedSteps.map((step, index) => {
                    const knownBehavior = behaviourChoices.some(choice => choice.code === step.behavior)
                    const kindValue = step.type

                    return (
                      <div
                        key={`step-${index}`}
                        className={styles.stepRow}
                        data-changed={!isEqual(selectedBindings[index], selectedBaseBindings[index]) ? 'true' : 'false'}
                        draggable
                        onDragStart={event => {
                          if (event.dataTransfer) {
                            event.dataTransfer.effectAllowed = 'move'
                          }
                          setDragIndex(index)
                        }}
                        onDragOver={event => {
                          event.preventDefault()
                          if (event.dataTransfer) {
                            event.dataTransfer.dropEffect = 'move'
                          }
                        }}
                        onDrop={event => {
                          event.preventDefault()
                          onDropRow(index)
                        }}
                        onDragEnd={() => setDragIndex(null)}
                        data-dragging={dragIndex === index ? 'true' : 'false'}
                      >
                        <div className={styles.dragHandle} title="Drag to reorder" aria-label="Drag to reorder">::</div>

                        <select
                          value={kindValue}
                          onChange={event => {
                            const nextType = event.target.value
                            const nextStep = nextType === 'mode-control'
                              ? { type: 'mode-control', control: MACRO_MODE_CONTROLS[0] }
                              : nextType === 'time-control'
                                ? { type: 'time-control', control: MACRO_TIME_CONTROLS[0], value: '30' }
                                : nextType === 'param-forward-control'
                                  ? { type: 'param-forward-control', control: MACRO_PARAM_FORWARD_CONTROLS[0] }
                                  : { type: 'behavior', behavior: '&none', paramsText: '' }

                            updateSelectedBindings(bindings => {
                              const parsed = bindings.map(parseMacroBinding)
                              parsed[index] = nextStep
                              return parsed.map(renderMacroBinding)
                            })
                          }}
                        >
                          <option value="behavior">behavior</option>
                          <option value="mode-control">mode-control</option>
                          <option value="time-control">time-control</option>
                          <option value="param-forward-control">param-forward-control</option>
                        </select>

                        {step.type === 'behavior' && (
                          <>
                            <select
                              value={knownBehavior ? step.behavior : '__custom__'}
                              onChange={event => {
                                const value = event.target.value
                                if (value === '__custom__') {
                                  return
                                }

                                updateSelectedBindings(bindings => {
                                  const parsed = bindings.map(parseMacroBinding)
                                  parsed[index] = {
                                    ...parsed[index],
                                    behavior: value
                                  }
                                  return parsed.map(renderMacroBinding)
                                })
                              }}
                            >
                              {behaviourChoices.map(choice => (
                                <option key={`macro-behavior-${index}-${choice.code}`} value={choice.code}>{choice.code}</option>
                              ))}
                              <option value="__custom__">Custom</option>
                            </select>

                            <input
                              type="text"
                              value={knownBehavior ? step.paramsText : step.behavior}
                              placeholder={knownBehavior ? 'params' : '&my_behavior'}
                              onChange={event => {
                                const value = event.target.value
                                updateSelectedBindings(bindings => {
                                  const parsed = bindings.map(parseMacroBinding)
                                  if (knownBehavior) {
                                    parsed[index] = {
                                      ...parsed[index],
                                      paramsText: value
                                    }
                                  } else {
                                    parsed[index] = {
                                      ...parsed[index],
                                      behavior: value
                                    }
                                  }

                                  return parsed.map(renderMacroBinding)
                                })
                              }}
                            />
                          </>
                        )}

                        {step.type === 'mode-control' && (
                          <select
                            value={step.control}
                            onChange={event => {
                              const value = event.target.value
                              updateSelectedBindings(bindings => {
                                const parsed = bindings.map(parseMacroBinding)
                                parsed[index] = {
                                  ...parsed[index],
                                  control: value
                                }
                                return parsed.map(renderMacroBinding)
                              })
                            }}
                          >
                            {MACRO_MODE_CONTROLS.map(control => (
                              <option key={`mode-control-${index}-${control}`} value={control}>{control}</option>
                            ))}
                          </select>
                        )}

                        {step.type === 'time-control' && (
                          <>
                            <select
                              value={step.control}
                              onChange={event => {
                                const value = event.target.value
                                updateSelectedBindings(bindings => {
                                  const parsed = bindings.map(parseMacroBinding)
                                  parsed[index] = {
                                    ...parsed[index],
                                    control: value
                                  }
                                  return parsed.map(renderMacroBinding)
                                })
                              }}
                            >
                              {MACRO_TIME_CONTROLS.map(control => (
                                <option key={`time-control-${index}-${control}`} value={control}>{control}</option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={step.value || ''}
                              onChange={event => {
                                const value = event.target.value
                                updateSelectedBindings(bindings => {
                                  const parsed = bindings.map(parseMacroBinding)
                                  parsed[index] = {
                                    ...parsed[index],
                                    value
                                  }
                                  return parsed.map(renderMacroBinding)
                                })
                              }}
                            />
                          </>
                        )}

                        {step.type === 'param-forward-control' && (
                          <select
                            value={step.control}
                            onChange={event => {
                              const value = event.target.value
                              updateSelectedBindings(bindings => {
                                const parsed = bindings.map(parseMacroBinding)
                                parsed[index] = {
                                  ...parsed[index],
                                  control: value
                                }
                                return parsed.map(renderMacroBinding)
                              })
                            }}
                          >
                            {MACRO_PARAM_FORWARD_CONTROLS.map(control => (
                              <option key={`param-control-${index}-${control}`} value={control}>{control}</option>
                            ))}
                          </select>
                        )}

                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={() => {
                            updateSelectedBindings(bindings => bindings.filter((_, stepIndex) => stepIndex !== index))
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
                      updateSelectedBindings(bindings => [...bindings, '&none'])
                    }}
                  >
                    Add Step
                  </button>
                </div>
              )}

              {rawMode && (
                <div className={styles.group}>
                  <div className={styles.groupTitle}>Bindings (raw)</div>
                  <textarea
                    aria-label="Macro Raw Bindings"
                    className={styles.rawTextarea}
                    value={rawDraft}
                    onChange={event => setRawDraft(event.target.value)}
                  />
                  <div className={styles.rawActions}>
                    <button type="button" onClick={() => setRawDraft(renderRawMacroBindings(selectedBindings))}>Format</button>
                    <button type="button" onClick={applyRaw}>Apply Raw</button>
                  </div>
                </div>
              )}
            </div>

            <div
              className={styles.group}
              data-changed={optionalKnownPresentKeys.some(key => !isEqual(selectedNode?.properties?.[key], selectedBaseNode?.properties?.[key])) ? 'true' : 'false'}
            >
              <div className={styles.groupTitle}>Optional Properties</div>
              {optionalKnownPresentKeys.length === 0 && (
                <p className={styles.emptyHint}>No optional properties added.</p>
              )}
              {optionalKnownPresentKeys.map(key => {
                const specType = key === 'label'
                  ? 'string'
                  : selectedSpecMap[key]?.type || selectedNode.property_types?.[key] || 'raw'
                const value = selectedNode.properties?.[key]

                return (
                  <div
                    className={styles.knownRow}
                    data-changed={!isEqual(value, selectedBaseNode?.properties?.[key]) ? 'true' : 'false'}
                    key={`optional-known-${key}`}
                  >
                    <label>{key === 'label' ? 'Property Label' : key}</label>
                    {specType === 'int' ? (
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={value ?? ''}
                        onChange={event => {
                          const raw = event.target.value
                          if (!raw.trim()) {
                            setOptionalKnownProperty(key, '', 'int')
                            return
                          }

                          const parsed = parseOptionalNonNegativeInt(raw)
                          if (!parsed.valid) {
                            setLocalErrors([`${key} must be a non-negative integer`])
                            return
                          }
                          setOptionalKnownProperty(key, parsed.value, 'int')
                        }}
                      />
                    ) : (
                      <input
                        aria-label={key === 'label' ? 'Property Label' : key}
                        type="text"
                        value={value ?? ''}
                        onChange={event => setOptionalKnownProperty(key, event.target.value, specType)}
                      />
                    )}
                    <button type="button" onClick={() => removeOptionalKnownProperty(key)}>Remove</button>
                  </div>
                )
              })}
            </div>

            <div className={styles.group}>
              <div className={styles.groupTitle}>Add Known Properties</div>
              {optionalKnownMissingKeys.length === 0 && (
                <p className={styles.emptyHint}>No known properties left to add.</p>
              )}
              {optionalKnownMissingKeys.length > 0 && (
                <div className={styles.addKnownList}>
                  {optionalKnownMissingKeys.map(key => (
                    <button
                      key={`add-optional-known-${key}`}
                      type="button"
                      onClick={() => addOptionalKnownProperty(key)}
                    >
                      Add {key}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

MacroEditor.propTypes = {
  baseKeymap: PropTypes.object,
  keymap: PropTypes.object.isRequired,
  behaviorTypes: PropTypes.array.isRequired,
  availableBehaviours: PropTypes.array,
  onUpdate: PropTypes.func.isRequired
}

MacroEditor.defaultProps = {
  availableBehaviours: []
}

export default MacroEditor
