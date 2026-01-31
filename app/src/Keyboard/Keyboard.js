import filter from 'lodash/filter'
import get from 'lodash/get'
import isEmpty from 'lodash/isEmpty'
import keyBy from 'lodash/keyBy'
import times from 'lodash/times'
import PropTypes from 'prop-types'
import { useContext, useEffect, useMemo, useState } from 'react'

import KeyboardLayout from './KeyboardLayout'
import LayerSelector from './LayerSelector'
import KeyEditPane from './Keys/KeyEditPane'
import { getKeyBoundingBox } from '../key-units'
import { DefinitionsContext, SearchContext } from '../providers'
import styles from './styles.module.css'

function Keyboard(props) {
  const { layout, keymap, onUpdate } = props
  const [activeLayer, setActiveLayer] = useState(0)
  const [selectedKeyIndex, setSelectedKeyIndex] = useState(null)
  const {keycodes, behaviours} = useContext(DefinitionsContext)

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
    return {
      behaviour: behaviours,
      layer: availableLayers,
      mod: filter(keycodes, 'isModifier'),
      code: keycodes
    }
  }, [behaviours, keycodes, availableLayers])

  const getSearchTargets = useMemo(() => function (param, behaviour) {
    // Special case for behaviour commands which can dynamically add another
    // parameter that isn't defined at the root level of the behaviour.
    // Currently this is just `&bt BT_SEL` and is only represented as an enum.
    if (param.enum) {
      return param.enum.map(v => ({ code: v }))
    }

    if (param === 'command') {
      return get(sources, ['behaviours', behaviour, 'commands'], [])
    }

    if (!searchTargets[param]) {
      console.log('cannot find target for', param)
    }

    return searchTargets[param]
  }, [searchTargets, sources])

  const boundingBox = useMemo(() => function () {
    return layout.map(key => getKeyBoundingBox(
      { x: key.x, y: key.y },
      { u: key.u || key.w || 1, h: key.h || 1 },
      { x: key.rx, y: key.ry, a: key.r }
    )).reduce(({ x, y }, { max }) => ({
      x: Math.max(x, max.x),
      y: Math.max(y, max.y)
    }), { x: 0, y: 0 })
  }, [layout])

  const getWrapperStyle = useMemo(() => function () {
    const bbox = boundingBox()
    return {
      width: `${bbox.x}px`,
      height: `${bbox.y}px`,
      margin: '0 auto',
      padding: '40px'
    }
  }, [boundingBox])

  const activeBindings = useMemo(() => layout.map((_, i) => (
    get(keymap, ['layers', activeLayer, i], { value: '&none', params: [] })
  )), [layout, keymap, activeLayer])

  useEffect(() => {
    if (selectedKeyIndex === null) {
      return
    }
    if (selectedKeyIndex >= layout.length) {
      setSelectedKeyIndex(null)
    }
  }, [selectedKeyIndex, layout.length, setSelectedKeyIndex])

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

  const handleCreateLayer = useMemo(() => function () {
    const layer = keymap.layers.length
    const binding = '&trans'
    const makeKeycode = () => ({ value: binding, params: [] })

    const newLayer = times(layout.length, makeKeycode)
    const updatedLayerNames = [ ...keymap.layer_names, `Layer #${layer}` ]
    const layers = [ ...keymap.layers, newLayer ]

    onUpdate({ ...keymap, layer_names: updatedLayerNames, layers })
  }, [keymap, layout, onUpdate])

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
  }, [setSelectedKeyIndex])

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

    if (activeLayer > layers.length - 1) {
      setActiveLayer(Math.max(0, layers.length - 1))
    }

    onUpdate({ ...keymap, layers, layer_names })
  }, [keymap, activeLayer, setActiveLayer, onUpdate])

  return (
    <>
      <SearchContext.Provider value={{ getSearchTargets, sources }}>
        <div className={styles.workspace}>
          <div className={styles['keyboard-pane']}>
            <LayerSelector
              layers={keymap.layer_names}
              activeLayer={activeLayer}
              onSelect={setActiveLayer}
              onNewLayer={handleCreateLayer}
              onRenameLayer={handleRenameLayer}
              onDeleteLayer={handleDeleteLayer}
            />
            <div className={styles['keyboard-wrapper']} style={getWrapperStyle()}>
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
            </div>
          </div>
          <KeyEditPane
            className={styles['side-pane']}
            selectedKey={selectedKey}
            onApply={handleApplyBinding}
            onClose={() => setSelectedKeyIndex(null)}
          />
        </div>
      </SearchContext.Provider>
    </>
  )
}

Keyboard.propTypes = {
  layout: PropTypes.array.isRequired,
  keymap: PropTypes.object.isRequired,
  onUpdate: PropTypes.func.isRequired
}

export default Keyboard
