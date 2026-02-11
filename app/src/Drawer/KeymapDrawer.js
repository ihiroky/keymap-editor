import PropTypes from 'prop-types'
import { useMemo } from 'react'

import { buildDrawerRenderModels } from './model'
import styles from './styles.module.css'

function KeymapDrawer(props) {
  const {
    layout,
    keymap,
    keycodes,
    behaviours,
    behaviourTypes
  } = props

  const layers = useMemo(() => (
    buildDrawerRenderModels({
      layout,
      keymap,
      keycodes,
      behaviours,
      behaviourTypes
    })
  ), [layout, keymap, keycodes, behaviours, behaviourTypes])

  return (
    <div className={styles.drawerRoot} data-keymap-drawer='true' aria-label='Keymap drawer'>
      {layers.length === 0 && (
        <p className={styles.empty}>No layers available.</p>
      )}

      {layers.map(layer => (
        <section
          key={layer.id}
          id={layer.id}
          className={styles.layerSection}
          data-testid={layer.id}
        >
          <h2 className={styles.layerLabel}>{layer.name}:</h2>
          <div
            className={styles.layerCanvas}
            style={{ width: `${layer.width}px`, height: `${layer.height}px` }}
          >
            <svg
              className={styles.comboOverlay}
              viewBox={`0 0 ${layer.width} ${layer.height}`}
              width={layer.width}
              height={layer.height}
              aria-hidden='true'
            >
              {layer.combos.map(combo => (
                combo.connectors.map(connector => (
                  <line
                    key={connector.id}
                    x1={connector.x1}
                    y1={connector.y1}
                    x2={connector.x2}
                    y2={connector.y2}
                    className={styles.comboLine}
                    data-testid={connector.id}
                  />
                ))
              ))}
            </svg>

            {layer.keys.map(key => (
              <div
                key={key.id}
                className={styles.key}
                style={key.style}
                data-key-index={key.index}
                title={key.binding}
              >
                {key.behaviorLabel && (
                  <span
                    className={styles.keyBehavior}
                    data-testid={`key-behavior-${layer.index}-${key.index}`}
                    title={key.binding}
                  >
                    {key.behaviorLabel}
                  </span>
                )}
                <span
                  className={styles.keyTap}
                  data-testid={`key-tap-${layer.index}-${key.index}`}
                  title={key.binding}
                >
                  {key.tapLabel}
                </span>
                {key.layerMove && (
                  <a
                    href={key.layerMove.href}
                    className={styles.layerActivator}
                    data-testid={`layer-link-${layer.index}-${key.index}`}
                    title={`Move to ${key.layerMove.label} (Layer ${key.layerMove.targetLayer})`}
                  >
                    {key.layerMove.label}
                  </a>
                )}
              </div>
            ))}

            {layer.combos.map(combo => (
              <div
                key={combo.id}
                className={styles.comboBox}
                data-testid={combo.id}
                title={combo.title || combo.label}
                style={{
                  left: `${combo.left}px`,
                  top: `${combo.top}px`,
                  width: `${combo.width}px`,
                  height: `${combo.height}px`
                }}
              >
                {combo.label}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

KeymapDrawer.propTypes = {
  layout: PropTypes.array,
  keymap: PropTypes.object,
  keycodes: PropTypes.array,
  behaviours: PropTypes.array,
  behaviourTypes: PropTypes.array
}

KeymapDrawer.defaultProps = {
  layout: [],
  keymap: null,
  keycodes: [],
  behaviours: [],
  behaviourTypes: []
}

export default KeymapDrawer
