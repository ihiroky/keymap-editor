const { parseKeymapCode } = require('./keymap-code')
const { parseKeymap, parseKeyBinding, generateKeymap } = require('./keymap')

const singleKeyLayout = [{ row: 0, col: 0 }]

describe('keymap range patch generation', () => {
  test('preserves comments in keymap layer when only bindings are updated', () => {
    const source = `
#include <behaviors.dtsi>

/ {
    keymap {
        compatible = "zmk,keymap";
        default_layer {
            // keep-layer-comment
            bindings = <&kp A>;
        };
    };
};
`

    const parsed = parseKeymap(parseKeymapCode(source))
    parsed.layers[0][0] = parseKeyBinding('&kp B')

    const generated = generateKeymap(singleKeyLayout, parsed)

    expect(generated.code).toContain('// keep-layer-comment')
    expect(generated.code).toContain('&kp B')
  })

  test('preserves comments in macro definition when property value is updated', () => {
    const source = `
/ {
    macros {
        macro_a: macro_a {
            compatible = "zmk,behavior-macro";
            #binding-cells = <0>;
            // keep-macro-comment
            bindings = <&kp A>;
        };
    };

    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <&none>;
        };
    };
};
`

    const parsed = parseKeymap(parseKeymapCode(source))
    parsed.behavior_definitions[0].properties.bindings = ['&kp B']

    const generated = generateKeymap(singleKeyLayout, parsed)

    expect(generated.code).toContain('// keep-macro-comment')
    expect(generated.code).toContain('bindings = <&kp B>;')
  })

  test('localizes regeneration when structure changes', () => {
    const source = `
/ {
    macros {
        macro_a: macro_a {
            compatible = "zmk,behavior-macro";
            #binding-cells = <0>;
            bindings = <&kp A>;
        };
    };

    keymap {
        compatible = "zmk,keymap";
        default_layer {
            // keep-layer-comment
            bindings = <&kp A>;
        };
    };
};
`

    const parsed = parseKeymap(parseKeymapCode(source))
    parsed.behavior_definitions.push({
      label: 'macro_b',
      name: 'macro_b',
      bind: '&macro_b',
      compatible: 'zmk,behavior-macro',
      properties: {
        compatible: 'zmk,behavior-macro',
        '#binding-cells': 0,
        bindings: ['&kp C']
      },
      property_types: {
        compatible: 'string',
        '#binding-cells': 'int',
        bindings: 'bindings'
      },
      property_order: ['compatible', '#binding-cells', 'bindings'],
      children: []
    })

    const generated = generateKeymap(singleKeyLayout, parsed)

    expect(generated.code).toContain('// keep-layer-comment')
    expect(generated.code).toContain('macro_b: macro_b')
  })

  test('keeps untouched override comments even when include set is incomplete', () => {
    const source = `
#include <dt-bindings/zmk/keys.h>

&trackball {
    automouse-layer = <4>;
    scroll-layers = <5>;
    // keep-trackball-comment
};

/ {
    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <&kp A>;
        };
    };
};
`

    const parsed = parseKeymap(parseKeymapCode(source))
    parsed.layers[0][0] = parseKeyBinding('&kp B')

    const generated = generateKeymap(singleKeyLayout, parsed, undefined, {
      behaviours: [
        {
          code: '&kp',
          includes: ['#include <dt-bindings/zmk/keys.h>', '#include "keys_jp.h"']
        }
      ],
      behaviourTypes: []
    })

    expect(generated.code).toContain('// keep-trackball-comment')
    expect(generated.code).toContain('&kp B')
  })

  test('falls back to full generation when required include is missing in patched source', () => {
    const source = `
#include <dt-bindings/zmk/keys.h>

/ {
    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <&kp A>;
        };
    };
};
`

    const parsed = parseKeymap(parseKeymapCode(source))
    parsed.layers[0][0] = parseKeyBinding('&bt BT_SEL 0')

    const generated = generateKeymap(singleKeyLayout, parsed, undefined, {
      behaviours: [
        {
          code: '&kp',
          includes: ['#include <dt-bindings/zmk/keys.h>']
        },
        {
          code: '&bt',
          includes: ['#include <dt-bindings/zmk/keys.h>', '#include <dt-bindings/zmk/bt.h>']
        }
      ],
      behaviourTypes: []
    })

    expect(generated.code).toContain('#include <dt-bindings/zmk/bt.h>')
    expect(generated.code).toContain('&bt BT_SEL 0')
  })

  test('uses explicit template and skips range patch path', () => {
    const source = `
/ {
    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <&kp A>;
        };
    };
};
`
    const template = `
/* custom-template */
{{rendered_keymap}}
`

    const parsed = parseKeymap(parseKeymapCode(source))
    parsed.layers[0][0] = parseKeyBinding('&kp B')

    const generated = generateKeymap(singleKeyLayout, parsed, template)

    expect(generated.code).toContain('/* custom-template */')
  })
})
