import cloneDeep from 'lodash/cloneDeep'
import get from 'lodash/get'
import PropTypes from 'prop-types'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'

import { SearchContext } from '../../providers'
import { getBehaviourParams } from '../../keymap'
import { createPromptMessage, hydrateTree } from './util'
import ValuePicker from '../../ValuePicker'
import styles from './key-edit-pane.module.css'

const PARAM_LABELS = {
  layer: 'Layer',
  mod: 'Modifier',
  code: 'Key Code',
  command: 'Command'
}

function getParamLabel(param) {
  if (param?.name) {
    return param.name
  }

  return PARAM_LABELS[param] || 'Param'
}

function getValueLabel(node) {
  const display = get(node, 'source.description') ||
    get(node, 'source.code') ||
    get(node, 'source.symbol') ||
    node?.value
  if (display === undefined || display === null || display === '') {
    return 'Select'
  }

  return String(display)
}

function normalizeDraft(draft, sources) {
  if (!draft) {
    return draft
  }

  const behaviour = get(sources, ['behaviours', draft.value])
  if (!behaviour) {
    return draft
  }

  const behaviourParams = getBehaviourParams(draft.params, behaviour)
  return {
    ...draft,
    params: (draft.params || []).slice(0, behaviourParams.length)
  }
}

function KeyEditPane(props) {
  const { selectedKey, onApply, onClose, className, style } = props
  const { getSearchTargets, sources } = useContext(SearchContext)
  const [draft, setDraft] = useState(null)
  const [picker, setPicker] = useState(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStateRef = useRef(null)
  const rafRef = useRef(null)
  const isPickerForPath = useMemo(() => function(path) {
    if (!picker || !picker.path) {
      return false
    }
    if (picker.path.length !== path.length) {
      return false
    }
    return picker.path.every((value, index) => value === path[index])
  }, [picker])

  useEffect(() => {
    if (!selectedKey) {
      setDraft(null)
      setPicker(null)
      return
    }

    setDraft(cloneDeep(selectedKey.binding))
    setPicker(null)
    setDragOffset({ x: 0, y: 0 })
  }, [selectedKey])

  const behaviour = useMemo(() => (
    draft ? get(sources, ['behaviours', draft.value]) : null
  ), [draft, sources])

  const behaviourParams = useMemo(() => (
    behaviour ? getBehaviourParams(draft.params, behaviour) : []
  ), [behaviour, draft])

  const normalized = useMemo(() => {
    if (!draft || !behaviour) {
      return null
    }
    return hydrateTree(draft.value, draft.params, sources)
  }, [draft, behaviour, sources])

  const isDirty = useMemo(() => {
    if (!selectedKey || !draft) {
      return false
    }
    return JSON.stringify(draft) !== JSON.stringify(selectedKey.binding)
  }, [draft, selectedKey])

  const openPicker = useMemo(() => function(param, path, value, node) {
    setPicker({ param, path, value, node })
  }, [])

  const updateParamAtPath = useMemo(() => function(path, value) {
    setDraft(prev => {
      if (!prev) {
        return prev
      }

      const next = cloneDeep(prev)
      let node = next
      const isObject = value && typeof value === 'object'
      const paramNode = isObject && Object.prototype.hasOwnProperty.call(value, 'value')
        ? cloneDeep({
          value: value.value,
          params: Array.isArray(value.params) && value.params.every(param => param && typeof param === 'object' && 'value' in param)
            ? value.params
            : []
        })
        : isObject && Object.prototype.hasOwnProperty.call(value, 'code')
          ? { value: value.code, params: [] }
          : { value, params: [] }

      path.forEach((index, step) => {
        if (!node.params) {
          node.params = []
        }
        if (!node.params[index]) {
          node.params[index] = { value: undefined, params: [] }
        }
        if (step === path.length - 1) {
          node.params[index] = paramNode
        } else {
          node = node.params[index]
        }
      })

      return normalizeDraft(next, sources)
    })
  }, [sources])

  const handleSelectValue = useMemo(() => function(choice) {
    if (!picker) {
      return
    }

    if (picker.param === 'behaviour') {
      setDraft(normalizeDraft({ value: choice.code, params: [] }, sources))
    } else {
      updateParamAtPath(picker.path, choice)
    }

    setPicker(null)
  }, [picker, updateParamAtPath, sources])

  const handleReset = useMemo(() => function() {
    if (!selectedKey) {
      return
    }
    setDraft(cloneDeep(selectedKey.binding))
    setPicker(null)
  }, [selectedKey])

  const handleApply = useMemo(() => function() {
    if (!draft) {
      return
    }
    onApply(normalizeDraft(cloneDeep(draft), sources))
  }, [draft, onApply, sources])

  const paneStyle = useMemo(() => {
    if (!selectedKey) {
      return style
    }

    return {
      ...style,
      transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`
    }
  }, [dragOffset, selectedKey, style])

  const handlePointerMove = useMemo(() => function(event) {
    const dragState = dragStateRef.current
    if (!dragState) {
      return
    }

    const nextX = dragState.originX + (event.clientX - dragState.startX)
    const nextY = dragState.originY + (event.clientY - dragState.startY)

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
    }

    rafRef.current = requestAnimationFrame(() => {
      setDragOffset({ x: nextX, y: nextY })
    })
  }, [])

  const stopDragging = useMemo(() => function() {
    dragStateRef.current = null
    setIsDragging(false)
  }, [])

  const handlePointerUp = useMemo(() => function() {
    if (!dragStateRef.current) {
      return
    }
    stopDragging()
  }, [stopDragging])

  const handlePointerDown = useMemo(() => function(event) {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y
    }
    setIsDragging(true)
  }, [dragOffset])

  useEffect(() => {
    if (!isDragging) {
      return
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [handlePointerMove, handlePointerUp, isDragging])

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  const renderParams = useMemo(() => function(params, values, pathPrefix, depth) {
    return params.map((param, i) => {
      const path = [...pathPrefix, i]
      const node = values?.[i]
      const label = getParamLabel(param)
      const hasNested = get(node, 'source.params.length', 0) > 0

      return (
        <div
          key={`${path.join('-')}-${depth}`}
          className={styles['param-row']}
          data-depth={depth}
        >
          <div className={styles['param-label']}>{label}</div>
          <button
            type="button"
            className={styles['param-value']}
            onClick={() => openPicker(param, path, node?.value, node)}
          >
            {getValueLabel(node)}
          </button>
          {hasNested && (
            <div className={styles['param-children']}>
              {renderParams(
                get(node, 'source.params', []),
                get(node, 'params', []),
                path,
                depth + 1
              )}
            </div>
          )}
          {picker && isPickerForPath(path) && draft && (
            <div className={styles.picker}>
              <ValuePicker
                target={{}}
                value={String(picker.value ?? '')}
                param={picker.param}
                currentNode={picker.node}
                choices={getSearchTargets(picker.param, draft.value) || []}
                prompt={createPromptMessage(picker.param)}
                searchKey="code"
                onSelect={handleSelectValue}
                onCancel={() => setPicker(null)}
              />
            </div>
          )}
        </div>
      )
    })
  }, [
    openPicker,
    picker,
    isPickerForPath,
    draft,
    getSearchTargets,
    handleSelectValue
  ])

  if (!selectedKey) {
    return (
      <aside className={`${styles.panel} ${className || ''}`} style={style}>
        <p className={styles.empty}>Select a key to edit.</p>
      </aside>
    )
  }

  const behaviourLabel = behaviour
    ? `${behaviour.code} | ${behaviour.name || 'Unnamed'}`
    : 'Select'

  return (
    <aside
      className={`${styles.panel} ${isDragging ? styles.dragging : ''} ${className || ''}`}
      style={paneStyle}
    >
      <div className={styles.header}>
        <div className={styles['header-info']}>
          <button
            type="button"
            className={styles['drag-handle']}
            onPointerDown={handlePointerDown}
            aria-label="Drag to move"
            title="Drag to move"
          />
            <div>
              <div className={styles.title}>
                Edit Keymap
              </div>
              <div className={styles.subtitle}>{selectedKey.label}</div>
            </div>
        </div>
        <button type="button" className={styles.close} onClick={onClose}>
          x
        </button>
      </div>

      <section className={styles.section}>
        <h3>Behavior</h3>
        <div className={styles['param-row']}>
          <div className={styles['param-label']}>Value</div>
          <button
            type="button"
            className={styles['param-value']}
            onClick={() => openPicker('behaviour', [], draft?.value)}
          >
            {behaviourLabel}
          </button>
        </div>
        {picker && picker.param === 'behaviour' && draft && (
          <div className={styles.picker}>
            <ValuePicker
              target={{}}
              value={String(picker.value ?? '')}
              param={picker.param}
              currentNode={picker.node}
              choices={getSearchTargets(picker.param, draft.value) || []}
              prompt={createPromptMessage(picker.param)}
              searchKey="code"
              onSelect={handleSelectValue}
              onCancel={() => setPicker(null)}
            />
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h3>Parameters</h3>
        {behaviourParams.length > 0 ? (
          <div className={styles['param-list']}>
            {renderParams(behaviourParams, normalized?.params, [], 0)}
          </div>
        ) : (
          <p className={styles.empty}>No parameters.</p>
        )}
      </section>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.apply}
          onClick={handleApply}
          disabled={!isDirty}
        >
          Apply
        </button>
        <button type="button" onClick={handleReset}>
          Reset
        </button>
      </div>
    </aside>
  )
}

KeyEditPane.propTypes = {
  className: PropTypes.string,
  style: PropTypes.object,
  selectedKey: PropTypes.shape({
    index: PropTypes.number.isRequired,
    label: PropTypes.string.isRequired,
    binding: PropTypes.shape({
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      params: PropTypes.array.isRequired
    }).isRequired
  }),
  onApply: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired
}

export default KeyEditPane
