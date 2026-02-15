import PropTypes from 'prop-types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import Icon from '../Common/Icon'
import styles from './styles.module.css'

function stop(fn) {
  return function(event) {
    event.stopPropagation()
    fn()
  }
}

function onKey(mapping) {
  return function(event) {
    if (mapping[event.key]) {
      mapping[event.key]()
    }
  }
}

function LayerSelector(props) {
  const ref = useRef(null)
  const { activeLayer, layers, changedLayers } = props
  const { onSelect, onNewLayer, onRenameLayer, onDeleteLayer, onDuplicateLayer, onMoveLayer } = props
  const [renaming, setRenaming] = useState(false)
  const [editing, setEditing] = useState('')
  const [draggingLayer, setDraggingLayer] = useState(null)
  const [dropLayer, setDropLayer] = useState(null)

  const handleSelect = useMemo(() => function(layer) {
    if (layer === activeLayer) {
      setEditing(layers[activeLayer])
      setRenaming(true)
      return
    }

    setRenaming(false)
    onSelect(layer)
  }, [layers, activeLayer, setEditing, setRenaming, onSelect])

  const handleAdd = useMemo(() => function() {
    onNewLayer()
  }, [onNewLayer])

  const handleDelete = useMemo(() => function(layerIndex, layerName) {
    const confirmation = `Really delete layer: ${layerName}?`
    window.confirm(confirmation) && onDeleteLayer(layerIndex)
  }, [onDeleteLayer])

  const handleDuplicate = useMemo(() => function(layerIndex) {
    onDuplicateLayer(layerIndex)
  }, [onDuplicateLayer])

  const handleDragStart = useMemo(() => function(layerIndex, event) {
    if (renaming) {
      return
    }

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(layerIndex))
    setDraggingLayer(layerIndex)
    setDropLayer(layerIndex)
  }, [renaming])

  const handleDragOver = useMemo(() => function(layerIndex, event) {
    if (draggingLayer === null) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropLayer(layerIndex)
  }, [draggingLayer])

  const handleDrop = useMemo(() => function(layerIndex, event) {
    if (draggingLayer === null) {
      return
    }

    event.preventDefault()
    if (draggingLayer !== layerIndex) {
      onMoveLayer(draggingLayer, layerIndex)
    }
    setDraggingLayer(null)
    setDropLayer(null)
  }, [draggingLayer, onMoveLayer])

  const handleDragEnd = useMemo(() => function() {
    setDraggingLayer(null)
    setDropLayer(null)
  }, [])

  const finishEditing = useCallback(() => {
    if (!renaming) {
      return
    }

    setEditing('')
    setRenaming(false)
    onRenameLayer(editing)
  }, [editing, renaming, setEditing, setRenaming, onRenameLayer])

  const cancelEditing = useCallback(() => {
    if (!renaming) {
      return
    }

    setEditing('')
    setRenaming(false)
  }, [renaming, setEditing, setRenaming])

  const handleClickOutside = useMemo(() => function(event) {
    const clickedOutside = ref.current && !ref.current.contains(event.target)
    if (!clickedOutside) {
      return
    }

    cancelEditing()
  }, [ref, cancelEditing])

  useEffect(() => {
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [handleClickOutside])

  const focusInput = useCallback(node => {
    if (node) {
      node.focus()
      node.select()
    }
  }, [])

  return (
    <div
      className={styles['layer-selector']}
      data-renaming={renaming}
      ref={ref}
    >
      <p>Layers:</p>
      <ul>
        {layers.map((name, i) => (
          <li
            key={`layer-${i}`}
            className={[
              activeLayer === i ? styles.active : '',
              draggingLayer === i ? styles.dragging : '',
              dropLayer === i && draggingLayer !== null && draggingLayer !== i ? styles['drag-over'] : ''
            ].join(' ')}
            data-layer={i}
            data-changed={changedLayers?.[i] ? 'true' : 'false'}
            draggable={!renaming}
            onClick={stop(() => handleSelect(i))}
            onDragStart={event => handleDragStart(i, event)}
            onDragOver={event => handleDragOver(i, event)}
            onDrop={event => handleDrop(i, event)}
            onDragEnd={handleDragEnd}
          >
            <span className={styles.index}>{i}</span>
            {(activeLayer === i && renaming) ? (
              <input
                ref={focusInput}
                className={styles.name}
                onChange={e => setEditing(e.target.value)}
                onKeyDown={onKey({
                  Enter: finishEditing,
                  Escape: cancelEditing
                })}
                value={
                  (activeLayer === i && renaming)
                    ? editing
                    : layers[i]
                }
              />
            ) : (
              <span className={styles.name}>
                {changedLayers?.[i] && <span className={styles['changed-dot']} aria-hidden='true' />}
                {name}
                <Icon
                  name="copy"
                  className={styles.duplicate}
                  onClick={stop(() => handleDuplicate(i))}
                  title={`Duplicate layer ${name}`}
                />
                <Icon
                  name="times-circle"
                  className={styles.delete}
                  onClick={stop(() => handleDelete(i, name))}
                  title={`Delete layer ${name}`}
                />
              </span>
            )}
          </li>
        ))}
        <li onClick={handleAdd}>
          <Icon className={styles.index} name="plus" />
          <span className={styles.name}>Add Layer</span>
        </li>
      </ul>
    </div>
  )
}

LayerSelector.propTypes = {
  layers: PropTypes.array.isRequired,
  changedLayers: PropTypes.array,
  activeLayer: PropTypes.number.isRequired,
  onSelect: PropTypes.func.isRequired,
  onNewLayer: PropTypes.func.isRequired,
  onRenameLayer: PropTypes.func.isRequired,
  onDeleteLayer: PropTypes.func.isRequired,
  onDuplicateLayer: PropTypes.func.isRequired,
  onMoveLayer: PropTypes.func.isRequired
}

export default LayerSelector
