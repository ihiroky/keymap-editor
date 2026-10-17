import compact from 'lodash/compact'
import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'

import * as config from '../config'
import { loadLayout } from '../layout.js'
import { loadKeymap } from '../keymap.js'
import Selector from "../Common/Selector"
import GithubPicker from './Github/Picker'
import BrowserFilePicker from './BrowserFile/Picker'
import styles from './styles.module.css'
import { keysJpUrl, layoutGuideUrl, readmeUrl } from '../links'

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
  const { onSelect, hideStartGuide = false } = props
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
    <div className={styles.picker}>
      {!hideStartGuide && (
        <section className={styles.guide} aria-label="getting started">
          <p className={styles.guideTitle}>はじめに（ZMK を使っている人へ）</p>
          <p className={styles.guideLead}>
            ZMK の <code>.keymap</code> を読み込んで画面上で編集し、書き戻すツールです。
            ビルドや commit / push は行いません。
          </p>

          <div className={styles.guideBlock}>
            <p className={styles.guideHeading}>準備するもの</p>
            <ul className={styles.guideList}>
              <li>
                自分の <code>zmk-config-&lt;キーボード名&gt;</code> の <code>config</code> フォルダ
              </li>
              <li>
                同じ名前の <code>&lt;キーボード名&gt;.keymap</code> と{' '}
                <code>&lt;キーボード名&gt;.json</code>
                （物理レイアウト定義。通常の zmk-config には入っていないため、{' '}
                <a href={layoutGuideUrl} target="_blank" rel="noreferrer noopener">
                  レイアウト定義の作り方
                </a>
                {' '}を参照）
              </li>
            </ul>
          </div>

          <div className={styles.guideBlock}>
            <p className={styles.guideHeading}>使い方</p>
            <ol className={styles.guideSteps}>
              <li>
                下の <code>Open Config Folder</code> を押して <code>config</code> フォルダを選ぶ
              </li>
              <li>キーをクリックして behavior とパラメータを編集する</li>
              <li>
                <code>Save Keymap</code> で保存する（書き込み不可のブラウザではダウンロード）。
                反映には自分で commit &amp; push が必要
              </li>
            </ol>
            <p className={styles.guideCaution}>
              保存時はキーマップ全体を再生成します。コメントや独自マクロなど、
              解析できない記述は失われることがあります。
            </p>
          </div>

          <div className={styles.guideFooter}>
            詳しい手順・制約・FAQ は{' '}
            <a href={readmeUrl} target="_blank" rel="noreferrer noopener">
              README
            </a>
            {' '}にまとめています。
          </div>

          <div className={styles.notice} role="note" aria-label="keys_jp.h notice">
            <p className={styles.noticeTitle}>keys_jp.h について</p>
            <p className={styles.noticeBody}>
              キーコードを使う behavior（
              <code>&amp;kp</code>
              {' / '}
              <code>&amp;mt</code>
              {' / '}
              <code>&amp;lt</code>
              など）を含む keymap を保存すると、選択したキーコードに関わらず
              {' '}
              <code>#include "keys_jp.h"</code>
              {' '}
              が追加されます。そのため
              <code>keys_jp.h</code>
              を、利用者自身の
              {' '}
              <code>zmk-config</code>
              {' '}
              内の
              {' '}
              <code>config</code>
              {' '}
              ディレクトリに格納してください。
              配布先:
              {' '}
              <a href={keysJpUrl} target="_blank" rel="noreferrer noopener">
                {keysJpUrl}
              </a>
            </p>
          </div>
        </section>
      )}

      {sourceChoices.length > 1 && (
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
      )}

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
  onSelect: PropTypes.func.isRequired,
  hideStartGuide: PropTypes.bool
}

export default KeyboardPicker
