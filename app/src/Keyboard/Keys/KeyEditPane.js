import cloneDeep from 'lodash/cloneDeep'
import get from 'lodash/get'
import PropTypes from 'prop-types'
import { useContext, useEffect, useMemo, useState } from 'react'

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
  const display = get(node, 'source.symbol') || get(node, 'source.code') || node?.value
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
  const { selectedKey, onApply, onClose, className } = props
  const { getSearchTargets, sources } = useContext(SearchContext)
  const [draft, setDraft] = useState(null)
  const [picker, setPicker] = useState(null)

  useEffect(() => {
    if (!selectedKey) {
      setDraft(null)
      setPicker(null)
      return
    }
    setDraft(cloneDeep(selectedKey.binding))
    setPicker(null)
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

  const openPicker = useMemo(() => function(param, path, value) {
    setPicker({
      param,
      path,
      value
    })
  }, [])

  const updateParamAtPath = useMemo(() => function(path, value) {
    setDraft(prev => {
      if (!prev) {
        return prev
      }

      const next = cloneDeep(prev)
      let node = next

      path.forEach((index, step) => {
        if (!node.params) {
          node.params = []
        }
        if (!node.params[index]) {
          node.params[index] = { value: undefined, params: [] }
        }
        if (step === path.length - 1) {
          node.params[index] = { value, params: [] }
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
      updateParamAtPath(picker.path, choice.code)
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
            onClick={() => openPicker(param, path, node?.value)}
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
        </div>
      )
    })
  }, [openPicker])

  if (!selectedKey) {
    return (
      <aside className={`${styles.panel} ${className || ''}`}>
        <p className={styles.empty}>Select a key to edit.</p>
      </aside>
    )
  }

  const behaviourLabel = behaviour
    ? `${behaviour.code} | ${behaviour.name || 'Unnamed'}`
    : 'Select'

  return (
    <aside className={`${styles.panel} ${className || ''}`}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Key Editor</div>
          <div className={styles.subtitle}>{selectedKey.label}</div>
        </div>
        <button type="button" className={styles.close} onClick={onClose}>
          x
        </button>
      </div>

      <section className={styles.section}>
        <h3>Behavior</h3>
        <button
          type="button"
          className={styles['param-value']}
          onClick={() => openPicker('behaviour', [], draft?.value)}
        >
          {behaviourLabel}
        </button>
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

      {picker && draft && (
        <div className={styles.picker}>
          <ValuePicker
            target={{}}
            value={String(picker.value ?? '')}
            param={picker.param}
            choices={getSearchTargets(picker.param, draft.value) || []}
            prompt={createPromptMessage(picker.param)}
            searchKey="code"
            onSelect={handleSelectValue}
            onCancel={() => setPicker(null)}
          />
        </div>
      )}

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
