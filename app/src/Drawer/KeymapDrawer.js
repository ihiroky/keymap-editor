import PropTypes from 'prop-types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { buildDrawerRenderModels } from './model'
import styles from './styles.module.css'

const PRINT_HORIZONTAL_MARGIN_PX = 0
const SCALE_PRECISION = 1000

function getPrintScale(layerWidth, viewportWidth) {
  if (layerWidth <= 0 || viewportWidth <= 0) {
    return 1
  }

  const availableWidth = Math.max(0, viewportWidth - PRINT_HORIZONTAL_MARGIN_PX * 2)
  if (availableWidth <= 0) {
    return 1
  }

  return Math.min(1, availableWidth / layerWidth)
}

function roundScale(value) {
  return Math.floor(value * SCALE_PRECISION) / SCALE_PRECISION
}

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

  const viewportRefs = useRef(new Map())
  const [printScales, setPrintScales] = useState({})

  const registerViewport = useCallback((layerId, node) => {
    if (node) {
      viewportRefs.current.set(layerId, node)
      return
    }

    viewportRefs.current.delete(layerId)
  }, [])

  const recalculatePrintScales = useCallback(() => {
    setPrintScales(previous => {
      const next = {}
      let hasChanged = false

      for (const layer of layers) {
        const viewport = viewportRefs.current.get(layer.id)
        const viewportWidth = viewport ? viewport.clientWidth : 0
        const scale = roundScale(getPrintScale(layer.width, viewportWidth))
        next[layer.id] = scale

        if (previous[layer.id] !== scale) {
          hasChanged = true
        }
      }

      if (!hasChanged && Object.keys(previous).length === layers.length) {
        return previous
      }

      return next
    })
  }, [layers])

  useEffect(() => {
    recalculatePrintScales()

    const viewports = Array.from(viewportRefs.current.values())
    const ResizeObserverClass = typeof window !== 'undefined'
      ? window.ResizeObserver
      : null

    let resizeObserver = null
    if (ResizeObserverClass) {
      resizeObserver = new ResizeObserverClass(() => {
        recalculatePrintScales()
      })

      for (const viewport of viewports) {
        resizeObserver.observe(viewport)
      }
    }

    const handleResize = () => {
      recalculatePrintScales()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize)
      window.addEventListener('beforeprint', handleResize)
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
      }

      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize)
        window.removeEventListener('beforeprint', handleResize)
      }
    }
  }, [layers, recalculatePrintScales])

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
            className={styles.layerCanvasViewport}
            ref={node => registerViewport(layer.id, node)}
          >
            <div
              className={styles.layerCanvasPrintFrame}
              style={{
                '--drawer-print-scale': printScales[layer.id] || 1,
                '--drawer-print-margin': `${PRINT_HORIZONTAL_MARGIN_PX}px`,
                '--drawer-layer-width': `${layer.width}px`,
                '--drawer-layer-height': `${layer.height}px`
              }}
            >
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
            </div>
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
