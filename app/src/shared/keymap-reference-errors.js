function parseNonNegativeInteger(value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null
  }

  return parsed
}

function normalizeBindingText(binding) {
  if (typeof binding === 'string') {
    return binding.trim()
  }

  if (typeof binding === 'number') {
    return String(binding)
  }

  if (binding && typeof binding === 'object') {
    if (typeof binding.value === 'string') {
      const values = [binding.value.trim()]
      const params = Array.isArray(binding.params)
        ? binding.params.map(node => String(node?.value || '').trim()).filter(Boolean)
        : []

      return [...values, ...params].filter(Boolean).join(' ')
    }
  }

  return ''
}

function getBindingCode(binding) {
  const text = normalizeBindingText(binding)
  if (!text) {
    return ''
  }

  const [code = ''] = text.split(/\s+/).filter(Boolean)
  return code
}

function splitBindingList(rawBindings) {
  if (Array.isArray(rawBindings)) {
    return rawBindings
      .map(value => String(value || '').trim())
      .filter(Boolean)
  }

  if (typeof rawBindings !== 'string') {
    return []
  }

  const tokens = rawBindings.trim().split(/\s+/).filter(Boolean)
  const bindings = []
  let current = []

  for (const token of tokens) {
    if (token.startsWith('&')) {
      if (current.length > 0) {
        bindings.push(current.join(' '))
      }
      current = [token]
      continue
    }

    if (current.length > 0) {
      current.push(token)
    }
  }

  if (current.length > 0) {
    bindings.push(current.join(' '))
  }

  return bindings
}

function getNodeBind(node) {
  if (!node || typeof node !== 'object') {
    return ''
  }

  if (typeof node.bind === 'string' && node.bind.trim()) {
    return node.bind.trim()
  }

  const name = typeof node.name === 'string' ? node.name.trim() : ''
  const label = typeof node.label === 'string' ? node.label.trim() : ''

  if (name.startsWith('&')) {
    return name
  }

  if (label) {
    return `&${label}`
  }

  if (name) {
    return `&${name}`
  }

  return ''
}

function buildAvailableBindingSet({ behaviours, keymap }) {
  const available = new Set()
  const behaviourList = Array.isArray(behaviours) ? behaviours : []
  const combos = Array.isArray(keymap?.combos) ? keymap.combos : []

  for (const behaviour of behaviourList) {
    const code = String(behaviour?.code || '').trim()
    if (code) {
      available.add(code)
    }
  }

  for (const combo of combos) {
    const bind = getNodeBind(combo)
    if (bind) {
      available.add(bind)
    }
  }

  return available
}

function getUnresolvedBindingCode(binding, availableBindings) {
  const code = getBindingCode(binding)
  if (!code || !code.startsWith('&')) {
    return null
  }

  if (availableBindings.has(code)) {
    return null
  }

  return code
}

function normalizeComboLayers(combo) {
  const layers = combo?.properties?.layers
  if (!Array.isArray(layers)) {
    return []
  }

  const seen = new Set()
  const normalized = []

  for (const value of layers) {
    const layer = parseNonNegativeInteger(value)
    if (layer === null || seen.has(layer)) {
      continue
    }

    seen.add(layer)
    normalized.push(layer)
  }

  return normalized
}

function isComboVisibleOnLayer(combo, layerIndex) {
  const layers = normalizeComboLayers(combo)
  return layers.length === 0 || layers.includes(layerIndex)
}

function normalizeComboPositions(combo, keyCount) {
  const positions = Array.isArray(combo?.properties?.['key-positions'])
    ? combo.properties['key-positions']
    : []

  const seen = new Set()
  const normalized = []

  for (const value of positions) {
    const index = parseNonNegativeInteger(value)
    if (index === null || index >= keyCount || seen.has(index)) {
      continue
    }

    seen.add(index)
    normalized.push(index)
  }

  return normalized
}

function collectComboReferenceIssues({ keymap, layerIndex, keyCount, availableBindings }) {
  const combos = Array.isArray(keymap?.combos) ? keymap.combos : []
  const keyMessagesByIndex = new Map()
  const comboMessagesByIndex = new Map()

  combos.forEach((combo, comboIndex) => {
    if (!isComboVisibleOnLayer(combo, layerIndex)) {
      return
    }

    const bindings = splitBindingList(combo?.properties?.bindings)
    const unresolvedCode = getUnresolvedBindingCode(bindings[0] || '&none', availableBindings)
    if (!unresolvedCode) {
      return
    }

    const comboName = String(combo?.name || combo?.label || `combo_${comboIndex + 1}`)
    const message = `Combo ${comboName}: unresolved binding ${unresolvedCode}`
    comboMessagesByIndex.set(comboIndex, message)

    const positions = normalizeComboPositions(combo, keyCount)
    for (const position of positions) {
      const current = keyMessagesByIndex.get(position) || []
      current.push(message)
      keyMessagesByIndex.set(position, current)
    }
  })

  return { keyMessagesByIndex, comboMessagesByIndex }
}

export {
  buildAvailableBindingSet,
  collectComboReferenceIssues,
  getBindingCode,
  getNodeBind,
  getUnresolvedBindingCode,
  isComboVisibleOnLayer,
  normalizeBindingText,
  normalizeComboLayers,
  normalizeComboPositions,
  splitBindingList
}
