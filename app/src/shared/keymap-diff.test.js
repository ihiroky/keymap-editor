import { diffLines, summarizeDiff } from './keymap-diff'

describe('diffLines', () => {
  test('returns all equal when texts match', () => {
    const lines = diffLines('a\nb\nc', 'a\nb\nc')

    expect(lines).toEqual([
      { type: 'equal', text: 'a' },
      { type: 'equal', text: 'b' },
      { type: 'equal', text: 'c' }
    ])
    expect(summarizeDiff(lines)).toEqual({ added: 0, removed: 0, unchanged: 3 })
  })

  test('marks a changed line as remove + add', () => {
    const lines = diffLines('a\nold\nc', 'a\nnew\nc')

    expect(summarizeDiff(lines)).toEqual({ added: 1, removed: 1, unchanged: 2 })
    expect(lines).toContainEqual({ type: 'remove', text: 'old' })
    expect(lines).toContainEqual({ type: 'add', text: 'new' })
  })

  test('handles added and removed lines', () => {
    const added = summarizeDiff(diffLines('a\nb', 'a\nb\nc'))
    expect(added).toEqual({ added: 1, removed: 0, unchanged: 2 })

    const removed = summarizeDiff(diffLines('a\nb\nc', 'a\nc'))
    expect(removed).toEqual({ added: 0, removed: 1, unchanged: 2 })
  })

  test('reports comments removed during regeneration as changes', () => {
    const original = '// keep me\n#include <behaviors.dtsi>\n&kp A'
    const regenerated = '#include <behaviors.dtsi>\n&kp A'
    const summary = summarizeDiff(diffLines(original, regenerated))

    expect(summary.removed).toBe(1)
  })

  test('treats missing input as empty text', () => {
    expect(diffLines(undefined, undefined)).toEqual([{ type: 'equal', text: '' }])
  })
})
