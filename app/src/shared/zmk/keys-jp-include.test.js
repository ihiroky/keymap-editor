const path = require('path')
const fs = require('fs')

const { generateKeymap, parseKeyBinding } = require('./keymap')

// この fork はキーコードを使う behavior に "keys_jp.h" の include を持たせている。
// そのため、JIS 系キーコードを使わなくても生成物には #include "keys_jp.h" が入る。
// 画面の案内（Pickers/KeyboardPicker）は「常に keys_jp.h が必要」という前提で
// 書かれているので、定義データとの不整合をここで検知する。
const behaviours = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../../../api/services/zmk/data/zmk-behaviors.json'),
  'utf8'
))

const KEYCODE_BEHAVIOURS = ['&kp', '&kt', '&lt', '&mt', '&sk', '&inc_dec_kp']

function generateFor (binding) {
  const layout = [{ x: 0, y: 0, label: 'A' }]
  const keymap = {
    layer_names: ['Base'],
    layers: [[parseKeyBinding(binding)]],
    sensor_layers: [],
    combos: [],
    conditional_layers: [],
    behavior_overrides: [],
    behavior_definitions: []
  }

  return generateKeymap(layout, keymap, undefined, {
    behaviours,
    behaviourTypes: []
  }).code
}

describe('keys_jp.h include guard', () => {
  test('behaviours taking a keycode declare the keys_jp.h include', () => {
    const byCode = new Map(behaviours.map(item => [item.code, item]))

    for (const code of KEYCODE_BEHAVIOURS) {
      expect(byCode.get(code)?.includes).toContain('#include "keys_jp.h"')
    }
  })

  test('is added even when only a non-JIS keycode is used', () => {
    expect(generateFor('&kp A')).toContain('#include "keys_jp.h"')
  })
})
