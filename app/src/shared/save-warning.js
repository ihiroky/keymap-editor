// 保存時に「全体を再生成する」旨の警告を表示するかどうかを localStorage に記憶する。
// 一度「今後表示しない」を選んだら、以降は警告なしで保存できる。
export const SAVE_WARNING_STORAGE_KEY = 'keymap-editor.save-warning-dismissed'

function resolveStorage(storage) {
  if (storage) {
    return storage
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }

  return null
}

export function isSaveWarningDismissed(storage) {
  const target = resolveStorage(storage)
  if (!target) {
    return false
  }

  try {
    return target.getItem(SAVE_WARNING_STORAGE_KEY) === 'true'
  } catch (err) {
    return false
  }
}

export function dismissSaveWarning(storage) {
  const target = resolveStorage(storage)
  if (!target) {
    return
  }

  try {
    target.setItem(SAVE_WARNING_STORAGE_KEY, 'true')
  } catch (err) {
    // ストレージが使えない環境では記憶しない（警告は毎回表示される）
  }
}
