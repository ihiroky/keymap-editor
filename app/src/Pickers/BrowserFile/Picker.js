import { useMemo, useState } from 'react'
import PropTypes from 'prop-types'

import Selector from '../../Common/Selector'
import Spinner from '../../Common/Spinner'
const { validateInfoJson, selectDefaultLayoutAndSensors } = require('../../shared/zmk/layout')
const { parseKeymapCode } = require('../../shared/zmk/keymap-code')
const { parseKeymap } = require('../../shared/zmk/keymap')

function isWritableBrowserFileSupported () {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

function getBaseName (fileName, extension) {
  const suffix = extension.toLowerCase()
  if (!fileName.toLowerCase().endsWith(suffix)) {
    return null
  }

  return fileName.slice(0, fileName.length - extension.length)
}

function BrowserFilePicker (props) {
  const { onSelect } = props
  const [writeCapable] = useState(isWritableBrowserFileSupported)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [directoryHandle, setDirectoryHandle] = useState(null)
  const [keymapFiles, setKeymapFiles] = useState([])
  const [selectedKeymapName, setSelectedKeymapName] = useState(null)
  const [keymapFile, setKeymapFile] = useState(null)
  const [jsonFile, setJsonFile] = useState(null)

  const loadFromContents = useMemo(() => async function (keymapContent, infoContent, sourceContext) {
    const info = JSON.parse(infoContent)
    validateInfoJson(info)

    const { layout, sensors } = selectDefaultLayoutAndSensors(info)
    const sensorCount = Array.isArray(sensors) ? sensors.length : 0
    const codeKeymap = parseKeymapCode(keymapContent, { sensorCount })
    if (!codeKeymap) {
      throw new Error('Failed to parse .keymap file')
    }

    onSelect({
      layout,
      sensors,
      keymap: parseKeymap(codeKeymap),
      sourceContext,
      browserFile: sourceContext
    })
  }, [onSelect])

  const loadFromHandles = useMemo(() => async function (selectedDirectoryHandle, selectedKeymapHandle) {
    const keymap = await selectedKeymapHandle.getFile()
    const keymapContent = await keymap.text()

    const baseName = getBaseName(selectedKeymapHandle.name, '.keymap')
    if (!baseName) {
      throw new Error(`Invalid keymap file name: ${selectedKeymapHandle.name}`)
    }

    const jsonHandle = await selectedDirectoryHandle.getFileHandle(`${baseName}.json`)
    const info = await jsonHandle.getFile()
    const infoContent = await info.text()

    await loadFromContents(keymapContent, infoContent, {
      writeCapable: true,
      fileName: selectedKeymapHandle.name,
      baseName,
      keymapHandle: selectedKeymapHandle,
      directoryHandle: selectedDirectoryHandle
    })
  }, [loadFromContents])

  const openDirectory = useMemo(() => async function () {
    setError(null)
    setLoading(true)

    try {
      const nextDirectoryHandle = await window.showDirectoryPicker()
      const entries = []

      for await (const [name, entryHandle] of nextDirectoryHandle.entries()) {
        if (entryHandle.kind === 'file' && name.toLowerCase().endsWith('.keymap')) {
          entries.push({ name, handle: entryHandle })
        }
      }

      entries.sort((a, b) => a.name.localeCompare(b.name))

      if (entries.length === 0) {
        throw new Error('No .keymap file found in the selected folder')
      }

      setDirectoryHandle(nextDirectoryHandle)
      setKeymapFiles(entries)

      const selected = entries[0]
      setSelectedKeymapName(selected.name)
      await loadFromHandles(nextDirectoryHandle, selected.handle)
    } catch (err) {
      if (err?.name === 'AbortError') {
        setLoading(false)
        return
      }

      setError(err?.message || String(err))
    }

    setLoading(false)
  }, [loadFromHandles])

  const loadSelectedKeymap = useMemo(() => async function (name) {
    if (!directoryHandle) {
      return
    }

    const selected = keymapFiles.find(entry => entry.name === name)
    if (!selected) {
      return
    }

    setSelectedKeymapName(name)
    setError(null)
    setLoading(true)

    try {
      await loadFromHandles(directoryHandle, selected.handle)
    } catch (err) {
      setError(err?.message || String(err))
    }

    setLoading(false)
  }, [directoryHandle, keymapFiles, loadFromHandles])

  const loadReadOnlyFiles = useMemo(() => async function () {
    if (!keymapFile || !jsonFile) {
      return
    }

    setError(null)
    setLoading(true)

    try {
      const keymapBase = getBaseName(keymapFile.name, '.keymap')
      const jsonBase = getBaseName(jsonFile.name, '.json')

      if (!keymapBase || !jsonBase || keymapBase !== jsonBase) {
        throw new Error('Selected .keymap and .json file names must match')
      }

      const [keymapContent, infoContent] = await Promise.all([
        keymapFile.text(),
        jsonFile.text()
      ])

      await loadFromContents(keymapContent, infoContent, {
        writeCapable: false,
        fileName: keymapFile.name,
        baseName: keymapBase
      })
    } catch (err) {
      setError(err?.message || String(err))
    }

    setLoading(false)
  }, [jsonFile, keymapFile, loadFromContents])

  const keymapChoices = keymapFiles.map(entry => ({
    id: entry.name,
    name: entry.name
  }))

  return (
    <div>
      {writeCapable ? (
        <>
          <button onClick={openDirectory}>
            Open Config Folder
          </button>

          {keymapChoices.length > 0 && (
            <Selector
              id="browser-keymap"
              label="Keymap"
              value={selectedKeymapName}
              choices={keymapChoices}
              onUpdate={loadSelectedKeymap}
            />
          )}
        </>
      ) : (
        <>
          <p>Direct file write is unavailable in this browser. Save uses download.</p>
          <label>
            Keymap (.keymap)
            <input
              type="file"
              accept=".keymap"
              onChange={event => setKeymapFile(event.target.files?.[0] || null)}
            />
          </label>
          <label>
            Layout JSON (.json)
            <input
              type="file"
              accept=".json,application/json"
              onChange={event => setJsonFile(event.target.files?.[0] || null)}
            />
          </label>
          <button disabled={!keymapFile || !jsonFile} onClick={loadReadOnlyFiles}>
            Load Files
          </button>
        </>
      )}

      {loading && <Spinner />}
      {error && <p>{error}</p>}
    </div>
  )
}

BrowserFilePicker.propTypes = {
  onSelect: PropTypes.func.isRequired
}

export default BrowserFilePicker
