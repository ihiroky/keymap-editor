function normalizeKind(kind) {
  const text = String(kind || '').trim()
  return text || 'item'
}

function normalizeName(name) {
  const text = String(name || '').trim()
  return text || ''
}

function normalizeMode(mode) {
  return mode === 'remove-added' ? 'remove-added' : 'delete'
}

export function buildItemDeletionMessage(options = {}) {
  const kind = normalizeKind(options.kind)
  const name = normalizeName(options.name)
  const mode = normalizeMode(options.mode)
  const action = mode === 'remove-added' ? 'Remove added' : 'Delete'
  const subject = name ? `${kind} "${name}"` : kind
  return `${action} ${subject}? This cannot be undone.`
}

export function confirmItemDeletion(options = {}) {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
    return true
  }

  return window.confirm(buildItemDeletionMessage(options))
}
