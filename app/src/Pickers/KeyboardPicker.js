import compact from 'lodash/compact'
import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'

import * as config from '../config'
import { loadLayout } from '../layout.js'
import { loadKeymap } from '../keymap.js'
import Selector from "../Common/Selector"
import GithubPicker from './Github/Picker'
import BrowserFilePicker from './BrowserFile/Picker'

const sourceChoices = compact([
  config.enableLocal ? { id: 'local', name: 'Local' } : null,
  config.enableGitHub ? { id: 'github', name: 'GitHub' } : null,
  config.enableBrowserFile ? { id: 'browser-file', name: 'Browser File' } : null
])

const selectedSource = localStorage.getItem('selectedSource')
const onlySource = sourceChoices.length === 1 ? sourceChoices[0].id : null
const defaultSource = onlySource || (
  sourceChoices.find(source => source.id === selectedSource)
    ? selectedSource
    : null
)

function KeyboardPicker(props) {
  const { onSelect } = props
  const [source, setSource] = useState(defaultSource)

  const handleKeyboardSelected = useMemo(() => function (event) {
    const { layout, keymap, sensors, sourceContext = {}, ...rest } = event

    const layerNames = keymap.layer_names || keymap.layers.map((_, i) => `Layer ${i}`)
    Object.assign(keymap, {
      layer_names: layerNames
    })

    onSelect({ source, layout, keymap, sensors, sourceContext, ...rest })
  }, [onSelect, source])

  const fetchLocalKeyboard = useMemo(() => async function() {
    const [layoutResponse, keymap] = await Promise.all([
      loadLayout(),
      loadKeymap()
    ])

    const layout = layoutResponse?.layout || layoutResponse
    const sensors = layoutResponse?.sensors || []

    handleKeyboardSelected({ source, layout, keymap, sensors })
  }, [source, handleKeyboardSelected])

  useEffect(() => {
    localStorage.setItem('selectedSource', source)
    if (source === 'local') {
      fetchLocalKeyboard()
    }
  }, [source, fetchLocalKeyboard])

  return (
    <div>
      <Selector
        id="source"
        label="Source"
        value={source}
        choices={sourceChoices}
        onUpdate={value => {
          setSource(value)
          onSelect({ source: value, sourceContext: {} })
        }}
      />

      {source === 'github' && (
        <GithubPicker onSelect={handleKeyboardSelected} />
      )}

      {source === 'browser-file' && (
        <BrowserFilePicker onSelect={handleKeyboardSelected} />
      )}
    </div>
  )
}

KeyboardPicker.propTypes = {
  onSelect: PropTypes.func.isRequired
}

export default KeyboardPicker
