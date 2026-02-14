import filter from 'lodash/filter'
import get from 'lodash/get'
import isEmpty from 'lodash/isEmpty'
import keyBy from 'lodash/keyBy'
import times from 'lodash/times'
import PropTypes from 'prop-types'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'

import KeyboardLayout from './KeyboardLayout'
import LayerSelector from './LayerSelector'
import KeyEditPane from './Keys/KeyEditPane'
import KeyParamlist from './Keys/KeyParamlist'
import { getKeyBoundingBox } from '../key-units'
import { getBehaviourParams } from '../keymap'
import { hydrateTree, makeIndex } from './Keys/util'
import { DefinitionsContext, SearchContext } from '../providers'
import styles from './styles.module.css'

function isSensorEditable(sensor) {
  if (!sensor || typeof sensor !== 'object') {
    return false
  }

  const compatible = sensor.compatible
  const hasCompatible = typeof compatible === 'string'
    ? compatible.trim().length > 0
    : compatible !== undefined && compatible !== null

  return hasCompatible || sensor.enabled === true
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.keys(value).reduce((copy, key) => {
    copy[key] = cloneValue(value[key])
    return copy
  }, {})
}

function buildDuplicatedLayerName(layerNames, layerIndex) {
  const sourceName = String(layerNames[layerIndex] || `Layer ${layerIndex}`).trim()
  const base = `${sourceName || 'Layer'} Copy`
  const existing = new Set(layerNames.map(name => String(name)))
  if (!existing.has(base)) {
    return base
  }

  for (let suffix = 2; suffix < Number.MAX_SAFE_INTEGER; suffix += 1) {
    const candidate = `${base} ${suffix}`
    if (!existing.has(candidate)) {
      return candidate
    }
  }

  return `${base} ${Date.now()}`
}

function moveArrayItem(list, from, to) {
  if (!Array.isArray(list)) {
    return list
  }

  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= list.length ||
    to >= list.length ||
    from === to
  ) {
    return [...list]
  }

  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

function moveIndex(index, from, to) {
  if (!Number.isInteger(index) || from === to) {
    return index
  }

  if (index === from) {
    return to
  }
  if (from < to && index > from && index <= to) {
    return index - 1
  }
  if (to < from && index >= to && index < from) {
    return index + 1
  }
  return index
}

function Keyboard(props) {
  const { layout, keymap, sensors, onUpdate } = props
  const [activeLayer, setActiveLayer] = useState(0)
  const [selectedKeyIndex, setSelectedKeyIndex] = useState(null)
  const [selectedSensorIndex, setSelectedSensorIndex] = useState(null)
  const [sensorAnchor, setSensorAnchor] = useState(null)
  const {keycodes, behaviours} = useContext(DefinitionsContext)
  const editPaneWidth = 340
  const editPaneGap = 12
  const wrapperPadding = 40
  const keyboardPaneRef = useRef(null)

  const availableLayers = useMemo(() => isEmpty(keymap) ? [] : (
    keymap.layers.map((_, i) => ({
      code: i,
      description: keymap.layer_names[i] || `Layer ${i}`
    }))
  ), [keymap])

  const sources = useMemo(() => ({
    kc: keycodes.indexed,
    code: keycodes.indexed,
    mod: keyBy(filter(keycodes, 'isModifier'), 'code'),
    behaviours: behaviours.indexed,
    layer: keyBy(availableLayers, 'code')
  }), [keycodes, behaviours, availableLayers])

  // TODO: this may be unnecessary
  const isReady = useMemo(() => function() {
    return (
      Object.keys(keycodes.indexed).length > 0 &&
      Object.keys(behaviours.indexed).length > 0 &&
      get(keymap, 'layers.length', 0) > 0
    )
  }, [keycodes, behaviours, keymap])

  const searchTargets = useMemo(() => {
    const sortedBehaviours = [...behaviours].sort((a, b) => (
      String(a?.code || '').localeCompare(String(b?.code || ''), undefined, {
        sensitivity: 'base'
      })
    ))

    return {
      behaviour: sortedBehaviours,
      layer: availableLayers,
      mod: filter(keycodes, 'isModifier'),
      code: keycodes
    }
  }, [behaviours, keycodes, availableLayers])

  const getSearchTargets = useMemo(() => function (param, behaviour) {
    // Special case for behaviour commands which can dynamically add another
    // parameter that isn't defined at the root level of the behaviour.
    // Currently this is just `&bt BT_SEL` and is only represented as an enum.
    if (param && typeof param === 'object' && Array.isArray(param.enum)) {
      return param.enum.map(v => ({ code: v }))
    }
    if (param && typeof param === 'object' && param.type === 'raw') {
      return []
    }

    if (param === 'command') {
      return get(sources, ['behaviours', behaviour, 'commands'], [])
    }

    return searchTargets[param]
  }, [searchTargets, sources])

  const layoutBounds = useMemo(() => (
    layout.map(key => getKeyBoundingBox(
      { x: key.x, y: key.y },
      { u: key.u || key.w || 1, h: key.h || 1 },
      { x: key.rx, y: key.ry, a: key.r }
    )).reduce(({ x, y }, { max }) => ({
      x: Math.max(x, max.x),
      y: Math.max(y, max.y)
    }), { x: 0, y: 0 })
  ), [layout])

  const wrapperStyle = useMemo(() => ({
    width: `${layoutBounds.x}px`,
    height: `${layoutBounds.y}px`,
    margin: '0 auto',
    padding: `${wrapperPadding}px`
  }), [layoutBounds, wrapperPadding])

  const sensorListStyle = useMemo(() => ({
    width: `${layoutBounds.x + wrapperPadding * 2}px`
  }), [layoutBounds, wrapperPadding])

  const activeBindings = useMemo(() => layout.map((_, i) => (
    get(keymap, ['layers', activeLayer, i], { value: '&none', params: [] })
  )), [layout, keymap, activeLayer])

  const sensorCount = useMemo(() => {
    if (Array.isArray(sensors) && sensors.length > 0) {
      return sensors.length
    }
    return get(keymap, ['sensor_layers', 0, 'length'], 0)
  }, [keymap, sensors])

  const editableSensors = useMemo(() => {
    if (!Array.isArray(sensors) || sensors.length === 0) {
      return null
    }

    return sensors.map(sensor => isSensorEditable(sensor))
  }, [sensors])

  const activeSensorBindings = useMemo(() => {
    const layer = get(keymap, ['sensor_layers', activeLayer], null)

    return Array.from({ length: sensorCount }, (_, sensorIndex) => {
      const binding = Array.isArray(layer) ? layer[sensorIndex] : undefined
      if (!binding) {
        return { value: '&none', params: [] }
      }
      if (typeof binding === 'string' || typeof binding === 'number') {
        return { value: binding, params: [] }
      }
      return binding
    })
  }, [keymap, activeLayer, sensorCount])

  const sensorEditPaneStyle = useMemo(() => {
    if (selectedSensorIndex === null || !sensorAnchor) {
      return null
    }

    const containerWidth = layoutBounds.x + wrapperPadding * 2
    const paneWidth = Math.min(editPaneWidth, Math.max(0, containerWidth - editPaneGap * 2))
    const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
    const safeLeft = value => clamp(
      value,
      editPaneGap,
      Math.max(editPaneGap, containerWidth - paneWidth - editPaneGap)
    )

    const left = safeLeft(sensorAnchor.left)
    const top = Math.max(editPaneGap, sensorAnchor.top)

    return {
      left: `${left}px`,
      top: `${top}px`,
      transform: `translate3d(0, calc(-100% - ${editPaneGap}px), 0)`,
      '--key-edit-pane-width': `${paneWidth}px`
    }
  }, [
    selectedSensorIndex,
    sensorAnchor,
    layoutBounds,
    wrapperPadding,
    editPaneWidth,
    editPaneGap
  ])

  const handleSelectSensor = useMemo(() => function(sensorIndex, event, editable) {
    if (editable === false) {
      return
    }

    setSelectedSensorIndex(sensorIndex)
    setSelectedKeyIndex(null)

    if (event?.currentTarget && keyboardPaneRef.current) {
      const buttonRect = event.currentTarget.getBoundingClientRect()
      const paneRect = keyboardPaneRef.current.getBoundingClientRect()
      setSensorAnchor({
        left: buttonRect.left - paneRect.left,
        top: buttonRect.top - paneRect.top,
        width: buttonRect.width,
        height: buttonRect.height
      })
    } else {
      setSensorAnchor(null)
    }
  }, [setSelectedSensorIndex, setSelectedKeyIndex, setSensorAnchor])

  const sensorList = useMemo(() => {
    if (!activeSensorBindings.length) {
      return null
    }

    return activeSensorBindings.map((binding, sensorIndex) => {
      const sensor = sensors?.[sensorIndex]
      const sensorLabel = sensor?.name || sensor?.identifier || `Sensor ${sensorIndex + 1}`
      const editable = editableSensors ? editableSensors[sensorIndex] === true : true
      const behaviour = get(sources.behaviours, binding.value)
      if (!behaviour) {
        return (
          <button
            key={`sensor-${sensorIndex}`}
            type="button"
            className={styles['sensor-item']}
            onClick={event => handleSelectSensor(sensorIndex, event, editable)}
            disabled={!editable}
            data-selected={selectedSensorIndex === sensorIndex ? 'true' : 'false'}
            data-editable={editable ? 'true' : 'false'}
          >
            <div className={styles['sensor-label']}>{sensorLabel}</div>
            <div className={styles['sensor-binding']}>{binding.value}</div>
          </button>
        )
      }

      const behaviourParams = getBehaviourParams(binding.params, behaviour)
      const normalized = hydrateTree(binding.value, binding.params, sources)
      const paramIndex = makeIndex(normalized)

      return (
        <button
          key={`sensor-${sensorIndex}`}
          type="button"
          className={styles['sensor-item']}
          onClick={event => handleSelectSensor(sensorIndex, event, editable)}
          disabled={!editable}
          data-selected={selectedSensorIndex === sensorIndex ? 'true' : 'false'}
          data-editable={editable ? 'true' : 'false'}
        >
          <div className={styles['sensor-label']}>{sensorLabel}</div>
          <div className={styles['sensor-binding']}>
            <span className={styles['sensor-behaviour']}>{behaviour.code}</span>
            <KeyParamlist
              root={true}
              index={paramIndex}
              params={behaviourParams}
              values={normalized.params}
              onSelect={undefined}
            />
          </div>
        </button>
      )
    })
  }, [activeSensorBindings, sensors, editableSensors, sources, handleSelectSensor, selectedSensorIndex])

  useEffect(() => {
    if (selectedKeyIndex === null) {
      return
    }
    if (selectedKeyIndex >= layout.length) {
      setSelectedKeyIndex(null)
    }
  }, [selectedKeyIndex, layout.length, setSelectedKeyIndex])

  useEffect(() => {
    if (selectedSensorIndex === null) {
      setSensorAnchor(null)
      return
    }
    if (selectedSensorIndex >= activeSensorBindings.length) {
      setSelectedSensorIndex(null)
      return
    }
    if (editableSensors && editableSensors[selectedSensorIndex] !== true) {
      setSelectedSensorIndex(null)
    }
  }, [
    selectedSensorIndex,
    activeSensorBindings.length,
    editableSensors,
    setSelectedSensorIndex,
    setSensorAnchor
  ])

  const selectedKey = useMemo(() => {
    if (selectedKeyIndex === null) {
      return null
    }

    const label = get(layout, [selectedKeyIndex, 'label'])
    return {
      index: selectedKeyIndex,
      label: label || `Key ${selectedKeyIndex + 1}`,
      binding: activeBindings[selectedKeyIndex]
    }
  }, [selectedKeyIndex, activeBindings, layout])

  const selectedSensor = useMemo(() => {
    if (selectedSensorIndex === null) {
      return null
    }
    if (editableSensors && editableSensors[selectedSensorIndex] !== true) {
      return null
    }

    const sensor = sensors?.[selectedSensorIndex]
    const label = sensor?.name || sensor?.identifier || `Sensor ${selectedSensorIndex + 1}`
    return {
      index: selectedSensorIndex,
      label,
      binding: activeSensorBindings[selectedSensorIndex]
    }
  }, [selectedSensorIndex, sensors, editableSensors, activeSensorBindings])

  const selectedKeyBounds = useMemo(() => {
    if (selectedKeyIndex === null) {
      return null
    }
    const key = layout[selectedKeyIndex]
    if (!key) {
      return null
    }
    return getKeyBoundingBox(
      { x: key.x, y: key.y },
      { u: key.u || key.w || 1, h: key.h || 1 },
      { x: key.rx, y: key.ry, a: key.r }
    )
  }, [selectedKeyIndex, layout])

  const editPaneStyle = useMemo(() => {
    if (!selectedKeyBounds) {
      return null
    }

    const containerWidth = layoutBounds.x + wrapperPadding * 2
    const containerHeight = layoutBounds.y + wrapperPadding * 2
    const paneWidth = Math.min(editPaneWidth, Math.max(0, containerWidth - editPaneGap * 2))
    const keyMinX = selectedKeyBounds.min.x + wrapperPadding
    const keyMaxX = selectedKeyBounds.max.x + wrapperPadding
    const keyMinY = selectedKeyBounds.min.y + wrapperPadding
    const keyMaxY = selectedKeyBounds.max.y + wrapperPadding

    const spaceRight = containerWidth - keyMaxX
    const spaceLeft = keyMinX
    const spaceBelow = containerHeight - keyMaxY
    const spaceAbove = keyMinY

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
    const safeLeft = value => clamp(
      value,
      editPaneGap,
      Math.max(editPaneGap, containerWidth - paneWidth - editPaneGap)
    )

    let left = safeLeft(keyMinX)
    let top = Math.max(editPaneGap, keyMinY)

    if (spaceRight >= paneWidth + editPaneGap) {
      left = keyMaxX + editPaneGap
      top = Math.max(editPaneGap, keyMinY)
    } else if (spaceLeft >= paneWidth + editPaneGap) {
      left = Math.max(editPaneGap, keyMinX - editPaneGap - paneWidth)
      top = Math.max(editPaneGap, keyMinY)
    } else if (spaceBelow >= editPaneGap) {
      left = safeLeft(keyMinX)
      top = keyMaxY + editPaneGap
    } else if (spaceAbove >= editPaneGap) {
      left = safeLeft(keyMinX)
      top = Math.max(editPaneGap, keyMinY - editPaneGap)
    }

    return {
      left: `${left}px`,
      top: `${top}px`,
      '--key-edit-pane-width': `${paneWidth}px`
    }
  }, [
    selectedKeyBounds,
    layoutBounds,
    wrapperPadding,
    editPaneWidth,
    editPaneGap
  ])

  const handleCreateLayer = useMemo(() => function () {
    const layer = keymap.layers.length
    const binding = '&trans'
    const makeKeycode = () => ({ value: binding, params: [] })
    const makeSensorBinding = () => ({ value: '&none', params: [] })

    const newLayer = times(layout.length, makeKeycode)
    const updatedLayerNames = [ ...keymap.layer_names, `Layer #${layer}` ]
    const layers = [ ...keymap.layers, newLayer ]
    const sensor_layers = Array.isArray(keymap.sensor_layers)
      ? [ ...keymap.sensor_layers, times(sensorCount, makeSensorBinding) ]
      : undefined

    const nextKeymap = { ...keymap, layer_names: updatedLayerNames, layers }
    if (sensor_layers !== undefined) {
      nextKeymap.sensor_layers = sensor_layers
    }

    onUpdate(nextKeymap)
  }, [keymap, layout, onUpdate, sensorCount])

  const handleUpdateLayer = useMemo(() => function(layerIndex, updatedLayer) {
    const original = keymap.layers
    const layers = [
      ...original.slice(0, layerIndex),
      updatedLayer,
      ...original.slice(layerIndex + 1)
    ]

    onUpdate({ ...keymap, layers })
  }, [keymap, onUpdate])

  const handleSelectKey = useMemo(() => function(keyIndex) {
    setSelectedKeyIndex(keyIndex)
    setSelectedSensorIndex(null)
    setSensorAnchor(null)
  }, [setSelectedKeyIndex, setSelectedSensorIndex, setSensorAnchor])


  const handleApplyBinding = useMemo(() => function(updatedBinding) {
    if (selectedKeyIndex === null) {
      return
    }
    const updatedLayer = [
      ...activeBindings.slice(0, selectedKeyIndex),
      updatedBinding,
      ...activeBindings.slice(selectedKeyIndex + 1)
    ]

    handleUpdateLayer(activeLayer, updatedLayer)
  }, [
    activeBindings,
    activeLayer,
    selectedKeyIndex,
    handleUpdateLayer
  ])

  const handleApplySensorBinding = useMemo(() => function(updatedBinding) {
    if (selectedSensorIndex === null || sensorCount === 0) {
      return
    }
    if (editableSensors && editableSensors[selectedSensorIndex] !== true) {
      return
    }

    const makeSensorBinding = () => ({ value: '&none', params: [] })
    const baseSensorLayers = Array.isArray(keymap.sensor_layers)
      ? keymap.sensor_layers
      : Array.from({ length: keymap.layers.length }, () => times(sensorCount, makeSensorBinding))

    const layer = baseSensorLayers[activeLayer] || times(sensorCount, makeSensorBinding)
    const updatedLayer = [
      ...layer.slice(0, selectedSensorIndex),
      updatedBinding,
      ...layer.slice(selectedSensorIndex + 1)
    ]

    const sensor_layers = [
      ...baseSensorLayers.slice(0, activeLayer),
      updatedLayer,
      ...baseSensorLayers.slice(activeLayer + 1)
    ]

    onUpdate({ ...keymap, sensor_layers })
  }, [
    selectedSensorIndex,
    sensorCount,
    editableSensors,
    keymap,
    activeLayer,
    onUpdate
  ])

  const handleRenameLayer = useMemo(() => function (layerName) {
    const layer_names = [
      ...keymap.layer_names.slice(0, activeLayer),
      layerName,
      ...keymap.layer_names.slice(activeLayer + 1)
    ]

    onUpdate({ ...keymap, layer_names })
  }, [keymap, activeLayer, onUpdate])

  const handleDeleteLayer = useMemo(() => function (layerIndex) {
    const layer_names = [...keymap.layer_names]
    layer_names.splice(layerIndex, 1)

    const layers = [...keymap.layers]
    layers.splice(layerIndex, 1)
    const sensor_layers = Array.isArray(keymap.sensor_layers) ? [...keymap.sensor_layers] : undefined
    if (sensor_layers !== undefined) {
      sensor_layers.splice(layerIndex, 1)
    }

    if (activeLayer > layers.length - 1) {
      setActiveLayer(Math.max(0, layers.length - 1))
    }

    const nextKeymap = { ...keymap, layers, layer_names }
    if (sensor_layers !== undefined) {
      nextKeymap.sensor_layers = sensor_layers
    }
    onUpdate(nextKeymap)
  }, [keymap, activeLayer, setActiveLayer, onUpdate])

  const handleDuplicateLayer = useMemo(() => function (layerIndex) {
    if (!Array.isArray(keymap.layers) || !keymap.layers[layerIndex]) {
      return
    }

    const duplicatedLayer = cloneValue(keymap.layers[layerIndex])
    const insertAt = layerIndex + 1
    const layer_names = [
      ...keymap.layer_names.slice(0, insertAt),
      buildDuplicatedLayerName(keymap.layer_names, layerIndex),
      ...keymap.layer_names.slice(insertAt)
    ]
    const layers = [
      ...keymap.layers.slice(0, insertAt),
      duplicatedLayer,
      ...keymap.layers.slice(insertAt)
    ]
    const sensor_layers = Array.isArray(keymap.sensor_layers)
      ? [
          ...keymap.sensor_layers.slice(0, insertAt),
          cloneValue(keymap.sensor_layers[layerIndex] || []),
          ...keymap.sensor_layers.slice(insertAt)
        ]
      : undefined

    const nextKeymap = { ...keymap, layer_names, layers }
    if (sensor_layers !== undefined) {
      nextKeymap.sensor_layers = sensor_layers
    }

    setActiveLayer(insertAt)
    onUpdate(nextKeymap)
  }, [keymap, setActiveLayer, onUpdate])

  const handleMoveLayer = useMemo(() => function (fromLayer, toLayer) {
    if (fromLayer === toLayer) {
      return
    }

    const layers = moveArrayItem(keymap.layers, fromLayer, toLayer)
    const layer_names = moveArrayItem(keymap.layer_names, fromLayer, toLayer)
    const sensor_layers = Array.isArray(keymap.sensor_layers)
      ? moveArrayItem(keymap.sensor_layers, fromLayer, toLayer)
      : undefined

    const nextKeymap = { ...keymap, layers, layer_names }
    if (sensor_layers !== undefined) {
      nextKeymap.sensor_layers = sensor_layers
    }

    setActiveLayer(currentLayer => moveIndex(currentLayer, fromLayer, toLayer))
    onUpdate(nextKeymap)
  }, [keymap, onUpdate, setActiveLayer])

  return (
    <>
      <SearchContext.Provider value={{ getSearchTargets, sources }}>
        <div className={styles.workspace}>
          <div className={styles['keyboard-pane']} ref={keyboardPaneRef}>
            <LayerSelector
              layers={keymap.layer_names}
              activeLayer={activeLayer}
              onSelect={setActiveLayer}
              onNewLayer={handleCreateLayer}
              onRenameLayer={handleRenameLayer}
              onDeleteLayer={handleDeleteLayer}
              onDuplicateLayer={handleDuplicateLayer}
              onMoveLayer={handleMoveLayer}
            />
            <div className={styles['keyboard-wrapper']} style={wrapperStyle}>
              {isReady() && (
                <KeyboardLayout
                  data-layer={activeLayer}
                  layout={layout}
                  bindings={activeBindings}
                  selectedKeyIndex={selectedKeyIndex}
                  onSelectKey={handleSelectKey}
                  onUpdate={event => handleUpdateLayer(activeLayer, event)}
                />
              )}
              {selectedKey && editPaneStyle && (
                <KeyEditPane
                  className={styles['floating-pane']}
                  style={editPaneStyle}
                  selectedKey={selectedKey}
                  onApply={handleApplyBinding}
                  onClose={() => setSelectedKeyIndex(null)}
                />
              )}
            </div>
            {sensorList && (
              <div className={styles['sensor-list']} style={sensorListStyle}>
                <div className={styles['sensor-title']}>Sensors</div>
                {sensorList}
              </div>
            )}
            {selectedSensor && sensorEditPaneStyle && (
              <KeyEditPane
                className={styles['floating-pane']}
                style={sensorEditPaneStyle}
                selectedKey={selectedSensor}
                onApply={handleApplySensorBinding}
                onClose={() => setSelectedSensorIndex(null)}
              />
            )}
          </div>
        </div>
      </SearchContext.Provider>
    </>
  )
}

Keyboard.propTypes = {
  layout: PropTypes.array.isRequired,
  sensors: PropTypes.array,
  keymap: PropTypes.object.isRequired,
  onUpdate: PropTypes.func.isRequired
}

export default Keyboard
