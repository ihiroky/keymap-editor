// 元の .keymap と生成後の .keymap を行単位で比較する。
// 保存前プレビュー（差分表示）でのみ使用する想定で、対象は数百行程度。
export function diffLines(oldText, newText) {
  const a = String(oldText ?? '').split('\n')
  const b = String(newText ?? '').split('\n')
  const n = a.length
  const m = b.length

  // LCS の長さテーブル（後ろから埋める）
  const table = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }

  const result = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: 'equal', text: a[i] })
      i += 1
      j += 1
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      result.push({ type: 'remove', text: a[i] })
      i += 1
    } else {
      result.push({ type: 'add', text: b[j] })
      j += 1
    }
  }

  while (i < n) {
    result.push({ type: 'remove', text: a[i] })
    i += 1
  }

  while (j < m) {
    result.push({ type: 'add', text: b[j] })
    j += 1
  }

  return result
}

export function summarizeDiff(lines) {
  const list = Array.isArray(lines) ? lines : []
  let added = 0
  let removed = 0

  for (const line of list) {
    if (line?.type === 'add') {
      added += 1
    } else if (line?.type === 'remove') {
      removed += 1
    }
  }

  return {
    added,
    removed,
    unchanged: list.length - added - removed
  }
}
