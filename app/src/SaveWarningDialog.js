import PropTypes from 'prop-types'
import { useState } from 'react'

import DialogBox from './Common/DialogBox'
import Modal from './Common/Modal'
import styles from './save-warning-dialog.module.css'

export default function SaveWarningDialog({ onConfirm, onCancel }) {
  const [dontShowAgain, setDontShowAgain] = useState(false)

  return (
    <Modal>
      <DialogBox dismissText={null}>
        <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="save warning">
          <h2 className={styles.title}>保存前の確認</h2>
          <p className={styles.body}>
            保存すると keymap 全体を再生成します。コメントや独自マクロなど、
            解析できない記述は失われることがあります。
          </p>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={event => setDontShowAgain(event.target.checked)}
            />
            今後この確認を表示しない
          </label>
          <div className={styles.actions}>
            <button type="button" onClick={onCancel}>
              キャンセル
            </button>
            <button
              type="button"
              className={styles.confirm}
              onClick={() => onConfirm({ dontShowAgain })}
            >
              保存する
            </button>
          </div>
        </div>
      </DialogBox>
    </Modal>
  )
}

SaveWarningDialog.propTypes = {
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
}
