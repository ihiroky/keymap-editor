import '@fortawesome/fontawesome-free/css/all.css'
import keyBy from 'lodash/keyBy'
import { useCallback, useMemo, useState } from 'react'

import * as config from './config'
import './App.css';
import { DefinitionsContext } from './providers'
import { loadKeycodes } from './keycodes'
import { loadBehaviours } from './api'
import KeyboardPicker from './Pickers/KeyboardPicker';
import Spinner from './Common/Spinner';
import Keyboard from './Keyboard/Keyboard'
import GitHubLink from './GitHubLink'
import Loader from './Common/Loader'
import github from './Pickers/Github/api'
const { generateKeymap } = require('./shared/zmk/keymap')

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

  const handleCompile = useCallback(() => {
    fetch(`${config.apiBaseUrl}/keymap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(editingKeymap || keymap)
    })
  }, [editingKeymap, keymap])

  const handleCommitChanges = useMemo(() => function() {
    const { repository, branch } = sourceOther.github

    ;(async function () {
      try {
        setSaving(true)
        setSaveError(null)
        await github.commitChanges(repository, branch, layout, editingKeymap, sensors)

        setKeymap(editingKeymap)
        setEditingKeymap(null)
      } catch (err) {
        setSaveError(err?.message || String(err))
      }

      setSaving(false)
    })()
  }, [
    layout,
    sensors,
    editingKeymap,
    sourceOther,
    setSaving,
    setKeymap,
    setEditingKeymap
  ])

  const handleSaveBrowserFile = useMemo(() => function() {
    const browserFile = sourceOther?.browserFile

    ;(async function () {
      const currentKeymap = editingKeymap || keymap
      if (!currentKeymap) {
        return
      }

      try {
        setSaving(true)
        setSaveError(null)

        const generated = generateKeymap(layout, currentKeymap, undefined, {
          sensors,
          behaviours: definitions?.behaviours || []
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
    keymap,
    editingKeymap,
    definitions,
    setSaving,
    setSaveError,
    setKeymap,
    setEditingKeymap
  ])

  const handleKeyboardSelected = useMemo(() => function(event) {
    const { source, layout, keymap, sensors, ...other } = event

    setSource(source)
    setSourceOther(other)
    setLayout(layout)
    setSensors(sensors || [])
    setKeymap(keymap)
    setEditingKeymap(null)
    setSaveError(null)
  }, [
    setSource,
    setSourceOther,
    setLayout,
    setSensors,
    setKeymap,
    setEditingKeymap,
    setSaveError
  ])

  const initialize = useMemo(() => {
    return async function () {
      const [keycodes, behaviours] = await Promise.all([
        loadKeycodes(),
        loadBehaviours()
      ])

      keycodes.indexed = keyBy(keycodes, 'code')
      behaviours.indexed = keyBy(behaviours, 'code')

      setDefinitions({ keycodes, behaviours })
    }
  }, [setDefinitions])

  const handleUpdateKeymap = useMemo(() => function(keymap) {
    setEditingKeymap(keymap)
  }, [setEditingKeymap])

  const saveControl = useMemo(() => {
    if (source === 'local') {
      return {
        title: 'Save keymap changes locally',
        disabled: !editingKeymap || saving,
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
        title: 'Commit keymap changes to GitHub repository',
        disabled: !editingKeymap || saving,
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
          ? 'Save keymap to selected local file (falls back to download if write fails)'
          : 'Save keymap as download',
        disabled: !editingKeymap || saving,
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
    editingKeymap,
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
        {saveError && (
          <p>{saveError}</p>
        )}
        <DefinitionsContext.Provider value={definitions}>
          {layout && keymap && (
            <Keyboard
              layout={layout}
              sensors={sensors}
              keymap={editingKeymap || keymap}
              onUpdate={handleUpdateKeymap}
              saveControl={saveControl}
            />
          )}
        </DefinitionsContext.Provider>
      </Loader>
      <GitHubLink className="github-link" />
    </>
  );
}

export default App;
