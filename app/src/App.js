import '@fortawesome/fontawesome-free/css/all.css'
import keyBy from 'lodash/keyBy'
import { useCallback, useMemo, useState } from 'react'

import * as config from './config'
import './App.css'
import './Common/editor-form-tokens.css'
import { DefinitionsContext } from './providers'
import { loadKeycodes } from './keycodes'
import { loadBehaviours, loadBehaviourTypes } from './api'
import KeyboardPicker from './Pickers/KeyboardPicker'
import Spinner from './Common/Spinner'
import Keyboard from './Keyboard/Keyboard'
import BehaviorEditor from './Behavior/BehaviorEditor'
import MacroEditor from './Macro/MacroEditor'
import ComboEditor from './Combo/ComboEditor'
import GitHubLink from './GitHubLink'
import Loader from './Common/Loader'
import github from './Pickers/Github/api'
import { generateKeymap } from './shared/zmk/keymap'
import { mergeBehaviorDefinitions, splitBehaviorDefinitions } from './shared/zmk/macro-helpers'

function getBrowserFileDownloadName (browserFile) {
  if (browserFile?.baseName) {
    return `${browserFile.baseName}.keymap`
  }

  if (typeof browserFile?.fileName === 'string' && browserFile.fileName.toLowerCase().endsWith('.keymap')) {
    return browserFile.fileName
  }

  return 'keymap.keymap'
}

function downloadTextFile (text, fileName) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => window.URL.revokeObjectURL(url), 0)
}

function augmentIndexed(list) {
  const next = Array.isArray(list) ? [...list] : []
  next.indexed = keyBy(next, 'code')
  return next
}

function normalizeKeymapShape(keymap) {
  if (!keymap || typeof keymap !== 'object') {
    return keymap
  }

  return {
    ...keymap,
    combos: Array.isArray(keymap.combos) ? keymap.combos : [],
    behavior_overrides: Array.isArray(keymap.behavior_overrides) ? keymap.behavior_overrides : [],
    behavior_definitions: Array.isArray(keymap.behavior_definitions) ? keymap.behavior_definitions : []
  }
}

function sanitizeNode(node) {
  if (!node || typeof node !== 'object') {
    return null
  }

  const name = typeof node.name === 'string' ? node.name.trim() : ''
  const label = typeof node.label === 'string' ? node.label.trim() : ''
  const bind = typeof node.bind === 'string' && node.bind.trim()
    ? node.bind.trim()
    : name.startsWith('&')
      ? name
      : label
        ? `&${label}`
        : name
          ? `&${name}`
          : ''

  return {
    ...node,
    name,
    label,
    bind,
    properties: node.properties && typeof node.properties === 'object' ? node.properties : {},
    property_types: node.property_types && typeof node.property_types === 'object' ? node.property_types : {}
  }
}

function getBindingCells(node, typeDef) {
  const fromProperties = Number(node?.properties?.['#binding-cells'])
  if (Number.isInteger(fromProperties) && fromProperties >= 0) {
    return fromProperties
  }

  const fromType = Number(typeDef?.defaultBindingCells)
  if (Number.isInteger(fromType) && fromType >= 0) {
    return fromType
  }

  return 0
}

function buildCustomBehaviour(node, typeByCompatible, fallbackName) {
  const normalized = sanitizeNode(node)
  if (!normalized || !normalized.bind) {
    return null
  }

  const compatible = normalized.properties?.compatible || normalized.compatible
  const typeDef = compatible ? typeByCompatible[compatible] : null
  const bindingCells = getBindingCells(normalized, typeDef)

  return {
    code: normalized.bind,
    name: normalized.label || fallbackName,
    description: compatible
      ? `Custom behavior (${compatible})`
      : 'Custom behavior',
    params: Array.from({ length: bindingCells }, (_, index) => ({
      name: `Param ${index + 1}`,
      type: 'raw'
    })),
    includes: typeDef?.defaultIncludes || [],
    bindingCells
  }
}

function mergeBehaviours(staticBehaviours, keymap, behaviourTypes) {
  const base = Array.isArray(staticBehaviours) ? [...staticBehaviours] : []
  const map = new Map(base.map(item => [item.code, true]))
  const typeByCompatible = keyBy(behaviourTypes || [], 'compatible')

  const custom = []
  const definitions = (keymap?.behavior_definitions || [])
  const overrides = (keymap?.behavior_overrides || [])

  for (const [index, definition] of definitions.entries()) {
    const entry = buildCustomBehaviour(definition, typeByCompatible, `Definition ${index + 1}`)
    if (entry && !map.has(entry.code)) {
      map.set(entry.code, true)
      custom.push(entry)
    }
  }

  for (const [index, override] of overrides.entries()) {
    const normalized = sanitizeNode(override)
    const entry = buildCustomBehaviour(override, typeByCompatible, `Override ${index + 1}`)
    const hasCompatible = Boolean(normalized?.properties?.compatible || normalized?.compatible)
    if (entry && !map.has(entry.code) && hasCompatible) {
      map.set(entry.code, true)
      custom.push(entry)
    }
  }

  custom.sort((a, b) => String(a.code).localeCompare(String(b.code)))
  return augmentIndexed([...base, ...custom])
}

function App() {
  const [definitions, setDefinitions] = useState(null)
  const [source, setSource] = useState(null)
  const [sourceOther, setSourceOther] = useState(null)
  const [layout, setLayout] = useState(null)
  const [sensors, setSensors] = useState([])
  const [keymap, setKeymap] = useState(null)
  const [editingKeymap, setEditingKeymap] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [activeTab, setActiveTab] = useState('keymap')

  const currentKeymap = editingKeymap || keymap
  const { macroDefinitions, behaviorDefinitions } = useMemo(() => (
    splitBehaviorDefinitions(currentKeymap?.behavior_definitions || [])
  ), [currentKeymap])

  const behaviorEditorKeymap = useMemo(() => {
    if (!currentKeymap) {
      return null
    }

    return {
      ...currentKeymap,
      behavior_definitions: behaviorDefinitions
    }
  }, [currentKeymap, behaviorDefinitions])

  const macroEditorKeymap = useMemo(() => {
    if (!currentKeymap) {
      return null
    }

    return {
      ...currentKeymap,
      behavior_definitions: macroDefinitions
    }
  }, [currentKeymap, macroDefinitions])

  const mergedBehaviours = useMemo(() => {
    if (!definitions || !currentKeymap) {
      return augmentIndexed([])
    }

    return mergeBehaviours(
      definitions.behaviours || [],
      currentKeymap,
      definitions.behaviourTypes || []
    )
  }, [definitions, currentKeymap])

  const definitionsContextValue = useMemo(() => {
    if (!definitions) {
      return {
        keycodes: augmentIndexed([]),
        behaviours: augmentIndexed([]),
        behaviourTypes: []
      }
    }

    return {
      ...definitions,
      behaviours: mergedBehaviours
    }
  }, [definitions, mergedBehaviours])

  const hasUnsavedChanges = Boolean(editingKeymap)

  const handleCompile = useCallback(() => {
    fetch(`${config.apiBaseUrl}/keymap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(currentKeymap)
    })
  }, [currentKeymap])

  const handleCommitChanges = useMemo(() => function () {
    const { repository, branch } = sourceOther.github

    ;(async function () {
      try {
        setSaving(true)
        setSaveError(null)
        await github.commitChanges(repository, branch, layout, currentKeymap, sensors)

        setKeymap(currentKeymap)
        setEditingKeymap(null)
      } catch (err) {
        setSaveError(err?.message || String(err))
      }

      setSaving(false)
    })()
  }, [
    layout,
    sensors,
    currentKeymap,
    sourceOther,
    setSaving,
    setKeymap,
    setEditingKeymap
  ])

  const handleSaveBrowserFile = useMemo(() => function () {
    const browserFile = sourceOther?.browserFile

    ;(async function () {
      if (!currentKeymap) {
        return
      }

      try {
        setSaving(true)
        setSaveError(null)

        const generated = generateKeymap(layout, currentKeymap, undefined, {
          sensors,
          behaviours: mergedBehaviours,
          behaviourTypes: definitions?.behaviourTypes || []
        })

        let writeError = null
        if (browserFile?.writeCapable && browserFile?.keymapHandle) {
          try {
            const writable = browserFile.keymapHandle
            const permissionOptions = { mode: 'readwrite' }

            if (typeof writable.queryPermission === 'function') {
              const permission = await writable.queryPermission(permissionOptions)
              if (permission !== 'granted' && typeof writable.requestPermission === 'function') {
                const requested = await writable.requestPermission(permissionOptions)
                if (requested !== 'granted') {
                  throw new Error('Write permission denied for the selected file')
                }
              }
            }

            const writeStream = await writable.createWritable()
            await writeStream.write(generated.code)
            await writeStream.close()
          } catch (err) {
            writeError = err
          }
        }

        if (writeError || !browserFile?.writeCapable || !browserFile?.keymapHandle) {
          downloadTextFile(generated.code, getBrowserFileDownloadName(browserFile))
          if (writeError) {
            setSaveError(`Saved as download because direct write failed: ${writeError?.message || String(writeError)}`)
          }
        }

        setKeymap(currentKeymap)
        setEditingKeymap(null)
      } catch (err) {
        setSaveError(err?.message || String(err))
      }

      setSaving(false)
    })()
  }, [
    sourceOther,
    layout,
    sensors,
    currentKeymap,
    mergedBehaviours,
    definitions,
    setSaving,
    setSaveError,
    setKeymap,
    setEditingKeymap
  ])

  const handleKeyboardSelected = useMemo(() => function (event) {
    const { source, layout, keymap, sensors, ...other } = event

    setSource(source)
    setSourceOther(other)
    setLayout(layout)
    setSensors(sensors || [])
    setKeymap(normalizeKeymapShape(keymap))
    setEditingKeymap(null)
    setSaveError(null)
    setActiveTab('keymap')
  }, [
    setSource,
    setSourceOther,
    setLayout,
    setSensors,
    setKeymap,
    setEditingKeymap,
    setSaveError,
    setActiveTab
  ])

  const initialize = useMemo(() => {
    return async function () {
      const [keycodes, behaviours, behaviourTypes] = await Promise.all([
        loadKeycodes(),
        loadBehaviours(),
        loadBehaviourTypes()
      ])

      const indexedKeycodes = augmentIndexed(keycodes)
      const indexedBehaviours = augmentIndexed(behaviours)
      const indexedBehaviourTypes = Array.isArray(behaviourTypes) ? [...behaviourTypes] : []
      indexedBehaviourTypes.indexed = keyBy(indexedBehaviourTypes, 'compatible')

      setDefinitions({
        keycodes: indexedKeycodes,
        behaviours: indexedBehaviours,
        behaviourTypes: indexedBehaviourTypes
      })
    }
  }, [setDefinitions])

  const handleUpdateKeymap = useMemo(() => function (nextKeymap) {
    const normalized = normalizeKeymapShape(nextKeymap)
    const base = normalizeKeymapShape(keymap)

    if (base && JSON.stringify(normalized) === JSON.stringify(base)) {
      setEditingKeymap(null)
      return
    }

    setEditingKeymap(normalized)
  }, [keymap, setEditingKeymap])

  const handleUpdateBehaviorDefinitions = useMemo(() => function (nextKeymap) {
    if (!currentKeymap) {
      return
    }

    const mergedDefinitions = mergeBehaviorDefinitions(
      currentKeymap.behavior_definitions || [],
      nextKeymap.behavior_definitions || [],
      'behavior'
    )

    handleUpdateKeymap({
      ...currentKeymap,
      ...nextKeymap,
      behavior_definitions: mergedDefinitions
    })
  }, [currentKeymap, handleUpdateKeymap])

  const handleUpdateMacroDefinitions = useMemo(() => function (nextKeymap) {
    if (!currentKeymap) {
      return
    }

    const mergedDefinitions = mergeBehaviorDefinitions(
      currentKeymap.behavior_definitions || [],
      nextKeymap.behavior_definitions || [],
      'macro'
    )

    handleUpdateKeymap({
      ...currentKeymap,
      ...nextKeymap,
      behavior_definitions: mergedDefinitions
    })
  }, [currentKeymap, handleUpdateKeymap])

  const saveControl = useMemo(() => {
    if (!currentKeymap) {
      return null
    }

    if (source === 'local') {
      return {
        title: 'Save keymap/behavior/macro/combo changes locally',
        disabled: !hasUnsavedChanges || saving,
        onClick: handleCompile,
        content: (
          <>
            {saving ? 'Saving' : 'Save Local'}
            {saving && <Spinner />}
          </>
        )
      }
    }

    if (source === 'github') {
      return {
        title: 'Commit keymap/behavior/macro/combo changes to GitHub repository',
        disabled: !hasUnsavedChanges || saving,
        onClick: handleCommitChanges,
        content: (
          <>
            {saving ? 'Saving' : 'Commit Changes'}
            {saving && <Spinner />}
          </>
        )
      }
    }

    if (source === 'browser-file') {
      return {
        title: sourceOther?.browserFile?.writeCapable
          ? 'Save keymap/behavior/macro/combo to selected local file (falls back to download if write fails)'
          : 'Save keymap/behavior/macro/combo as download',
        disabled: !hasUnsavedChanges || saving,
        onClick: handleSaveBrowserFile,
        content: (
          <>
            {saving ? 'Saving' : 'Save Browser File'}
            {saving && <Spinner />}
          </>
        )
      }
    }

    return null
  }, [
    source,
    sourceOther,
    currentKeymap,
    hasUnsavedChanges,
    saving,
    handleCompile,
    handleCommitChanges,
    handleSaveBrowserFile
  ])

  return (
    <>
      <Loader load={initialize}>
        <KeyboardPicker onSelect={handleKeyboardSelected} />
        {source === 'browser-file' && sourceOther?.browserFile?.writeCapable === false && (
          <p>Direct file write is unavailable in this browser. Save will download the .keymap file.</p>
        )}

        {layout && currentKeymap && (
          <div className="editor-toolbar">
            <div className="editor-tabs" role="tablist" aria-label="Editor mode">
              <button
                type="button"
                className={`editor-tab ${activeTab === 'keymap' ? 'active' : ''}`}
                onClick={() => setActiveTab('keymap')}
              >
                Keymap
              </button>
              <button
                type="button"
                className={`editor-tab ${activeTab === 'behavior' ? 'active' : ''}`}
                onClick={() => setActiveTab('behavior')}
              >
                Behavior
              </button>
              <button
                type="button"
                className={`editor-tab ${activeTab === 'macro' ? 'active' : ''}`}
                onClick={() => setActiveTab('macro')}
              >
                Macro
              </button>
              <button
                type="button"
                className={`editor-tab ${activeTab === 'combo' ? 'active' : ''}`}
                onClick={() => setActiveTab('combo')}
              >
                Combo
              </button>
            </div>
            {saveControl && (
              <button
                type="button"
                className="app-save-button"
                title={saveControl.title}
                disabled={saveControl.disabled}
                onClick={saveControl.onClick}
              >
                {saveControl.content}
              </button>
            )}
          </div>
        )}

        {saveError && (
          <p>{saveError}</p>
        )}

        <DefinitionsContext.Provider value={definitionsContextValue}>
          {layout && currentKeymap && activeTab === 'keymap' && (
            <Keyboard
              layout={layout}
              sensors={sensors}
              keymap={currentKeymap}
              onUpdate={handleUpdateKeymap}
            />
          )}

          {layout && behaviorEditorKeymap && activeTab === 'behavior' && (
            <BehaviorEditor
              keymap={behaviorEditorKeymap}
              behaviorTypes={definitions?.behaviourTypes || []}
              availableBehaviours={mergedBehaviours}
              onUpdate={handleUpdateBehaviorDefinitions}
            />
          )}

          {layout && macroEditorKeymap && activeTab === 'macro' && (
            <MacroEditor
              keymap={macroEditorKeymap}
              behaviorTypes={definitions?.behaviourTypes || []}
              availableBehaviours={mergedBehaviours}
              onUpdate={handleUpdateMacroDefinitions}
            />
          )}

          {layout && currentKeymap && activeTab === 'combo' && (
            <ComboEditor
              keymap={currentKeymap}
              layout={layout}
              availableBehaviours={mergedBehaviours}
              keycodes={definitions?.keycodes || []}
              onUpdate={handleUpdateKeymap}
            />
          )}
        </DefinitionsContext.Provider>
      </Loader>
      <GitHubLink className="github-link" />
    </>
  )
}

export default App
