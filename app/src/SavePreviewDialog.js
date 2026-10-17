import PropTypes from 'prop-types'
import { useMemo } from 'react'

import DialogBox from './Common/DialogBox'
import Modal from './Common/Modal'
import { diffLines, summarizeDiff } from './shared/keymap-diff'
import styles from './save-preview-dialog.module.css'

const TYPE_MARK = {
  add: '+',
  remove: '-',
  equal: ' '
}

export default function SavePreviewDialog({
  originalCode,
  generatedCode,
  onBackup,
  onConfirm,
  onCancel
}) {
  const hasOriginal = typeof originalCode === 'string'
  const diff = useMemo(
    () => (hasOriginal ? diffLines(originalCode, generatedCode) : null),
    [hasOriginal, originalCode, generatedCode]
  )
  const summary = useMemo(() => (diff ? summarizeDiff(diff) : null), [diff])

  return (
    <Modal>
      <DialogBox dismissText={null}>
        <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="save preview">
          <h2 className={styles.title}>保存内容のプレビュー</h2>

          {hasOriginal ? (
            <p className={styles.summary}>
              変更: 追加 {summary.added} 行 / 削除 {summary.removed} 行
            </p>
          ) : (
            <p className={styles.summary}>生成される .keymap 全体を表示しています。</p>
          )}

          <p className={styles.caution}>
            保存すると keymap 全体を再生成します。コメントや独自マクロなど、
            解析できない記述は失われることがあります。
          </p>

          <div className={styles.code} data-diff={hasOriginal ? 'true' : 'false'}>
            {diff
              ? diff.map((line, index) => (
                <div
                  key={index}
                  className={`${styles.line} ${styles[line.type]}`}
                  data-diff-line={line.type}
                >
                  <span className={styles.marker}>{TYPE_MARK[line.type]}</span>
                  <span className={styles.text}>{line.text}</span>
                </div>
              ))
              : <div className={styles.line}>{generatedCode}</div>}
          </div>

          <div className={styles.actions}>
            <button type="button" onClick={onCancel}>
              キャンセル
            </button>
            {hasOriginal && (
              <button type="button" onClick={() => onBackup()}>
                バックアップをダウンロード
              </button>
            )}
            <button type="button" className={styles.confirm} onClick={() => onConfirm()}>
              この内容で保存
            </button>
          </div>
        </div>
      </DialogBox>
    </Modal>
  )
}

SavePreviewDialog.propTypes = {
  originalCode: PropTypes.string,
  generatedCode: PropTypes.string.isRequired,
  onBackup: PropTypes.func,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
}

SavePreviewDialog.defaultProps = {
  onBackup: () => {}
}
