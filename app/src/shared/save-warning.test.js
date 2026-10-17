import {
  SAVE_WARNING_STORAGE_KEY,
  dismissSaveWarning,
  isSaveWarningDismissed
} from './save-warning'

function createMemoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value))
    }
  }
}

describe('save-warning helpers', () => {
  test('is not dismissed by default', () => {
    expect(isSaveWarningDismissed(createMemoryStorage())).toBe(false)
  })

  test('is dismissed once the flag is set', () => {
    const storage = createMemoryStorage()
    dismissSaveWarning(storage)
    expect(storage.getItem(SAVE_WARNING_STORAGE_KEY)).toBe('true')
    expect(isSaveWarningDismissed(storage)).toBe(true)
  })

  test('tolerates storage that throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('nope')
      },
      setItem: () => {
        throw new Error('nope')
      }
    }

    expect(isSaveWarningDismissed(throwing)).toBe(false)
    expect(() => dismissSaveWarning(throwing)).not.toThrow()
  })

  test('returns false when no storage is available', () => {
    const originalWindow = global.window
    // eslint-disable-next-line no-global-assign
    global.window = undefined

    try {
      expect(isSaveWarningDismissed()).toBe(false)
      expect(() => dismissSaveWarning()).not.toThrow()
    } finally {
      global.window = originalWindow
    }
  })
})
