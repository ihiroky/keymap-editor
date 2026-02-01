import fuzzysort from 'fuzzysort'
import PropTypes from 'prop-types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import style from './style.module.css'

const cycle = (array, index, step=1) => {
  const next = (index + step) % array.length
  return next < 0 ? array.length + next : next
}

function scrollIntoViewIfNeeded (element, alignToTop) {
  const scroll = element.offsetParent.scrollTop
  const height = element.offsetParent.offsetHeight
  const top = element.offsetTop
  const bottom = top + element.scrollHeight

  if (top < scroll || bottom > scroll + height) {
    element.scrollIntoView(alignToTop)
  }
}

const MODIFIER_GROUPS = [
  { id: 'control', label: 'Ctrl', left: 'LC', right: 'RC' },
  { id: 'shift', label: 'Shift', left: 'LS', right: 'RS' },
  { id: 'alt', label: 'Alt', left: 'LA', right: 'RA' },
  { id: 'gui', label: 'Gui', left: 'LG', right: 'RG' }
]

const MODIFIER_ROWS = [
  ['control', 'shift'],
  ['alt', 'gui']
]

const MODIFIER_ORDER = [
  'LC', 'RC',
  'LS', 'RS',
  'LA', 'RA',
  'LG', 'RG'
]

const MODIFIER_CODES = new Set(MODIFIER_ORDER)

function emptyModifierSelection () {
  return MODIFIER_ORDER.reduce((acc, code) => {
    acc[code] = false
    return acc
  }, {})
}

function parseModifierChain (node) {
  const selection = emptyModifierSelection()
  let current = node

  while (
    current &&
    typeof current === 'object' &&
    MODIFIER_CODES.has(current.value) &&
    Array.isArray(current.params) &&
    current.params.length === 1
  ) {
    if (!MODIFIER_CODES.has(current.value)) {
      break
    }

    selection[current.value] = true
    current = current.params[0]
  }

  return { selection, base: current }
}

function buildModifierNode (baseCode, selection) {
  const codes = MODIFIER_ORDER.filter(code => selection[code])

  let node = { value: baseCode, params: [] }
  for (let i = codes.length - 1; i >= 0; i -= 1) {
    node = { value: codes[i], params: [node] }
  }

  return node
}

function ValuePicker (props) {
  const { value, prompt, choices, searchKey, searchThreshold, showAllThreshold, param, currentNode } = props
  const { onCancel, onSelect } = props

  const listRef = useRef(null)
  const ignoreClickRef = useRef(true)

  const [query, setQuery] = useState(null)
  const [highlighted, setHighlighted] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const isCodeParam = param === 'code'

  const { selection: initialModifiers, base: baseNode } = useMemo(() => {
    if (!isCodeParam) {
      return { selection: emptyModifierSelection(), base: null }
    }
    return parseModifierChain(currentNode)
  }, [isCodeParam, currentNode])

  const [modifierSelection, setModifierSelection] = useState(initialModifiers)

  useEffect(() => {
    setModifierSelection(initialModifiers)
  }, [initialModifiers])

  const displayValue = useMemo(() => {
    if (isCodeParam && baseNode?.value !== undefined && baseNode?.value !== null) {
      return String(baseNode.value)
    }
    return value ?? ''
  }, [isCodeParam, baseNode, value])

  const results = useMemo(() => {
    const options = { key: searchKey, limit: 30 }
    const filtered = fuzzysort.go(query, choices, options)

    if (showAll || searchThreshold > choices.length) {
      return choices
    } else if (!query) {
      return choices.slice(0, searchThreshold)
    }

    return filtered.map(result => ({
      ...result.obj,
      search: result
    }))
  }, [query, choices, searchKey, showAll, searchThreshold])

  const enableShowAllButton = useMemo(() => {
    return (
      !showAll &&
      choices.length > searchThreshold &&
      choices.length <= showAllThreshold
    )
  }, [showAll, choices, searchThreshold, showAllThreshold])

  const hasModifiers = useMemo(() => (
    MODIFIER_ORDER.some(code => modifierSelection[code])
  ), [modifierSelection])

  const handleModifierChange = useCallback((code, checked) => {
    setModifierSelection(prev => ({
      ...prev,
      [code]: checked
    }))
  }, [])

  const handleModifierKeyDown = useCallback((event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key)) {
      event.stopPropagation()
    }
  }, [])

  const handleClickResult = useMemo(() => function(result) {
    if (isCodeParam && hasModifiers && result?.code) {
      onSelect(buildModifierNode(result.code, modifierSelection))
      return
    }
    onSelect(result)
  }, [onSelect, isCodeParam, hasModifiers, modifierSelection])

  const handleClickOutside = useMemo(() => function(event) {
    if (ignoreClickRef.current) {
      return
    }
    if (!listRef.current || !listRef.current.contains(event.target)) {
      onCancel()
    }
  }, [listRef, onCancel])

  const handleSelectActive = useMemo(() => function() {
    if (results.length > 0 && highlighted !== null) {
      handleClickResult(results[highlighted])
    }
  }, [results, highlighted, handleClickResult])

  const setHighlightPosition = useMemo(() => function(initial, offset) {
    if (results.length === 0) {
      setHighlighted(null)
      return
    }
    if (offset === undefined) {
      setHighlighted(initial)
      return
    }

    const next = highlighted !== null
      ? cycle(results, highlighted, offset)
      : initial

    const selector = `li[data-result-index="${next}"]`
    const element = listRef.current?.querySelector(selector)

    scrollIntoViewIfNeeded(element, false)
    setHighlighted(next)
  }, [results, highlighted, setHighlighted])

  const handleHighlightNext = useMemo(() => function() {
    setHighlightPosition(0, 1)
  }, [setHighlightPosition])

  const handleHightightPrev = useMemo(() => function() {
    setHighlightPosition(results.length - 1, -1)
  }, [setHighlightPosition, results])

  const handleKeyPress = useMemo(() => function(event) {
    setQuery(event.target.value)
  }, [setQuery])

  const handleKeyDown = useMemo(() => function (event) {
    const mapping = {
      ArrowDown: handleHighlightNext,
      ArrowUp: handleHightightPrev,
      Enter: handleSelectActive,
      Escape: onCancel
    }

    const action = mapping[event.key]
    if (action) {
      event.stopPropagation()
      action()
    }
  }, [
    handleHighlightNext,
    handleHightightPrev,
    handleSelectActive,
    onCancel
  ])

  const focusSearch = useCallback(node => {
    if (node) {
      node.focus()
      node.select()
    }
  }, [])

  useEffect(() => {
    ignoreClickRef.current = true
    const timer = setTimeout(() => {
      ignoreClickRef.current = false
      document.body.addEventListener('click', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timer)
      document.body.removeEventListener('click', handleClickOutside)
    }
  }, [handleClickOutside])

  return (
    <div className={style.dialog} onKeyDown={handleKeyDown} ref={listRef}>
      <p>{prompt}</p>
      <input
        ref={focusSearch}
        type="text"
        value={query !== null ? query : displayValue}
        onChange={handleKeyPress}
      />
      {isCodeParam && (
        <div className={style.modifiers} onKeyDown={handleModifierKeyDown}>
          <div className={style['modifiers-title']}>Modifiers</div>
          {MODIFIER_ROWS.map((row, rowIndex) => (
            <div key={`modifier-row-${rowIndex}`} className={style['modifier-row']}>
              {row.map(groupId => {
                const group = MODIFIER_GROUPS.find(item => item.id === groupId)
                if (!group) {
                  return null
                }
                return (
                  <div key={group.id} className={style['modifier-group']}>
                    <div className={style['modifier-label']}>{group.label}</div>
                    <label className={style['modifier-option']}>
                      <input
                        type="checkbox"
                        checked={modifierSelection[group.left]}
                        onChange={(event) => handleModifierChange(group.left, event.target.checked)}
                      />
                      <span>Left</span>
                    </label>
                    <label className={style['modifier-option']}>
                      <input
                        type="checkbox"
                        checked={modifierSelection[group.right]}
                        onChange={(event) => handleModifierChange(group.right, event.target.checked)}
                      />
                      <span>Right</span>
                    </label>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
      <ul className={style.results}>
        {results.map((result, i) => (
          <li
            key={`result-${i}`}
            className={highlighted === i ? style.highlighted : ''}
            title={result.description}
            data-result-index={i}
            onClick={() => handleClickResult(result)}
            onMouseOver={() => setHighlightPosition(i)}
          >
            {result.search ? (
              <span dangerouslySetInnerHTML={{
                __html: fuzzysort.highlight(result.search)
              }} />
            ) : (
              <span>
                {result[searchKey]}
              </span>
            )}
          </li>
        ))}
      </ul>
      {choices.length > searchThreshold && (
        <div className={style['choices-counter']}>
          Total choices: {choices.length}.
          {enableShowAllButton && (
            <button onClick={setShowAll(true)}>Show all</button>
          )}
        </div>
      )}
    </div>
  )
}

ValuePicker.propTypes = {
  target: PropTypes.object.isRequired,
  choices: PropTypes.array.isRequired,
  param: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.object
  ]).isRequired,
  value: PropTypes.string.isRequired,
  currentNode: PropTypes.shape({
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    params: PropTypes.array
  }),
  prompt: PropTypes.string.isRequired,
  searchKey: PropTypes.string.isRequired,
  searchThreshold: PropTypes.number,
  showAllThreshold: PropTypes.number,
  onCancel: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired
}

ValuePicker.defaultProps = {
}

export default ValuePicker
