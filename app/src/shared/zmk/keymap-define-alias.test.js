const { parseKeymapCode } = require('./keymap-code')
const { parseKeymap, parseKeyBinding, generateKeymap } = require('./keymap')

const behaviours = [
  { code: '&kp', includes: ['#include <dt-bindings/zmk/keys.h>'] },
  { code: '&bt', includes: ['#include <dt-bindings/zmk/keys.h>', '#include <dt-bindings/zmk/bt.h>'] },
  { code: '&mo', includes: [] }
]
const behaviourTypes = []

const threeKeyLayout = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }]

function generate (keymap, layout = threeKeyLayout) {
  return generateKeymap(layout, keymap, undefined, { behaviours, behaviourTypes }).code
}

describe('#define マクロ別名 binding の保護', () => {
  test('behavior 別名を先頭に使った binding が取りこぼされない', () => {
    const source = `#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>

#define HOME_MOD &kp

/ {
    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <HOME_MOD A &kp B &kp C>;
        };
    };
};
`
    const parsed = parseKeymap(parseKeymapCode(source))
    expect(parsed.layers[0]).toEqual([
      { value: 'HOME_MOD', params: [{ value: 'A', params: [] }] },
      { value: '&kp', params: [{ value: 'B', params: [] }] },
      { value: '&kp', params: [{ value: 'C', params: [] }] }
    ])
  })

  test('別名 binding を含むレイヤーを編集しても他のキーが消えない', () => {
    const source = `#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>

#define HOME_MOD &kp

/ {
    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <HOME_MOD A &kp B &kp C>;
        };
    };
};
`
    const parsed = parseKeymap(parseKeymapCode(source))
    parsed.layers[0][1] = parseKeyBinding('&kp Z')
    const code = generate(parsed)

    expect(code).toContain('HOME_MOD A')
    expect(code).toContain('&kp Z')
    expect(code).toContain('&kp C')
    expect(code).toContain('#define HOME_MOD &kp')
  })

  test('binding 途中に現れる別名も新しいキーとして区切る', () => {
    const source = `#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>

#define HOME_MOD &kp

/ {
    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <&kp A HOME_MOD B &kp C>;
        };
    };
};
`
    const parsed = parseKeymap(parseKeymapCode(source))
    expect(parsed.layers[0]).toEqual([
      { value: '&kp', params: [{ value: 'A', params: [] }] },
      { value: 'HOME_MOD', params: [{ value: 'B', params: [] }] },
      { value: '&kp', params: [{ value: 'C', params: [] }] }
    ])
  })

  test('behavior ではない #define はパラメータのまま扱う', () => {
    const source = `#include <behaviors.dtsi>

#define LOWER 3

/ {
    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <&mo LOWER &kp B &kp C>;
        };
    };
};
`
    const parsed = parseKeymap(parseKeymapCode(source))
    expect(parsed.layers[0]).toEqual([
      { value: '&mo', params: [{ value: 'LOWER', params: [] }] },
      { value: '&kp', params: [{ value: 'B', params: [] }] },
      { value: '&kp', params: [{ value: 'C', params: [] }] }
    ])
  })

  test('未知の先頭トークンでも取りこぼさずキー数を維持する', () => {
    const source = `#include <behaviors.dtsi>

/ {
    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <UNKNOWN_MACRO A &kp B &kp C>;
        };
    };
};
`
    const parsed = parseKeymap(parseKeymapCode(source))
    expect(parsed.layers[0]).toEqual([
      { value: 'UNKNOWN_MACRO', params: [{ value: 'A', params: [] }] },
      { value: '&kp', params: [{ value: 'B', params: [] }] },
      { value: '&kp', params: [{ value: 'C', params: [] }] }
    ])
  })

  test('別名経由の behavior を include 判定でも解決し、不要な再生成を起こさない', () => {
    const source = `#include <behaviors.dtsi>

#define MYBT &bt BT_SEL

/ {
    keymap {
        compatible = "zmk,keymap";
        default_layer {
            // keep-layer-comment
            bindings = <MYBT 0 &kp B &kp C>;
        };
    };
};
`
    const parsed = parseKeymap(parseKeymapCode(source))
    // 直接 `&bt` を使う編集。元から別名経由で `&bt` を必要としているので
    // 新しい include は不要 → 範囲差分のまま（コメントが残る）になるはず。
    parsed.layers[0][1] = parseKeyBinding('&bt BT_SEL 1')
    const code = generate(parsed)

    expect(code).toContain('// keep-layer-comment')
    expect(code).toContain('MYBT 0')
    expect(code).toContain('&bt BT_SEL 1')
  })
})
