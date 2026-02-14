import get from 'lodash/get'
import PropTypes from 'prop-types'
import { useContext } from 'react'

import { SearchContext } from '../../providers'
import { getBehaviourParams } from '../../keymap'
import { getKeyStyles } from '../../key-units'

import KeyParamlist from './KeyParamlist'
import * as keyPropTypes from './keyPropTypes'
import { hydrateTree, isSimple, isComplex, makeIndex } from './util'
import styles from './styles.module.css'

function Key(props) {
  const { sources } = useContext(SearchContext)
  const { position, rotation, size } = props
  const { label, value, params, selected, onSelect, hasError, errorMessage } = props

  const bind = value
  const behaviour = get(sources.behaviours, bind)
  const behaviourParams = getBehaviourParams(params, behaviour)

  const normalized = hydrateTree(value, params, sources)

  const index = makeIndex(normalized)
  const positioningStyle = getKeyStyles(position, size, rotation)

  function onMouseOver(event) {
    const old = document.querySelector(`.${styles.highlight}`)
    old && old.classList.remove(styles.highlight)
    event.target.classList.add(styles.highlight)
  }
  function onMouseLeave(event) {
    event.target.classList.remove(styles.highlight)
  }

  return (
    <div
      className={styles.key}
      data-label={label}
      data-u={size.u}
      data-h={size.h}
      data-simple={isSimple(normalized)}
      data-long={isComplex(normalized, behaviourParams)}
      data-selected={selected ? 'true' : 'false'}
      data-error={hasError ? 'true' : 'false'}
      style={positioningStyle}
      title={errorMessage || undefined}
      onMouseOver={onMouseOver}
      onMouseLeave={onMouseLeave}
      onClick={onSelect}
    >
    {hasError && (
      <span className={styles['error-marker']} aria-hidden='true'>!</span>
    )}
    {behaviour ? (
      <span
        className={styles['behaviour-binding']}
      >
        {behaviour.code}
      </span>
    ) : null}
    <KeyParamlist
      root={true}
      index={index}
      params={behaviourParams}
      values={normalized.params}
      onSelect={undefined}
    />
  </div>
  )
}

Key.propTypes = {
  position: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired
  }),
  rotation: PropTypes.shape({
    a: PropTypes.number,
    rx: PropTypes.number,
    ry: PropTypes.number
  }),
  size: PropTypes.shape({
    u: PropTypes.number.isRequired,
    h: PropTypes.number.isRequired
  }),
  label: PropTypes.string,
  value: keyPropTypes.value.isRequired,
  params: PropTypes.arrayOf(keyPropTypes.node),
  hasError: PropTypes.bool,
  errorMessage: PropTypes.string,
  selected: PropTypes.bool,
  onSelect: PropTypes.func
}

export default Key
