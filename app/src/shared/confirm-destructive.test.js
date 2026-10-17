import {
  buildDiscardAllMessage,
  buildItemDeletionMessage,
  confirmDiscardAllChanges,
  confirmItemDeletion
} from './confirm-destructive'

describe('confirm-destructive helpers', () => {
  let confirmSpy

  beforeEach(() => {
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    confirmSpy.mockRestore()
  })

  test('builds delete message with irreversible note', () => {
    expect(buildItemDeletionMessage({
      kind: 'layer',
      name: 'Nav',
      mode: 'delete'
    })).toBe('Delete layer "Nav"? This cannot be undone.')
  })

  test('builds remove-added message with irreversible note', () => {
    expect(buildItemDeletionMessage({
      kind: 'combo',
      name: 'combo_b',
      mode: 'remove-added'
    })).toBe('Remove added combo "combo_b"? This cannot be undone.')
  })

  test('calls window.confirm and returns its result', () => {
    confirmSpy.mockReturnValue(false)

    const result = confirmItemDeletion({
      kind: 'macro',
      name: 'macro_2',
      mode: 'delete'
    })

    expect(result).toBe(false)
    expect(confirmSpy).toHaveBeenCalledWith('Delete macro "macro_2"? This cannot be undone.')
  })

  test('builds discard-all message with irreversible note', () => {
    expect(buildDiscardAllMessage()).toBe('Discard all unsaved changes? This cannot be undone.')
  })

  test('confirmDiscardAllChanges calls window.confirm and returns its result', () => {
    confirmSpy.mockReturnValue(false)

    expect(confirmDiscardAllChanges()).toBe(false)
    expect(confirmSpy).toHaveBeenCalledWith('Discard all unsaved changes? This cannot be undone.')
  })
})
