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

  test('preserves comments in combo definition when property value is updated', () => {
    const source = `
/ {
    combos {
        compatible = "zmk,combos";

        esc_combo: esc_combo {
            // keep-combo-comment
            timeout-ms = <30>;
            key-positions = <0 1>;
            bindings = <&kp ESC>;
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
    parsed.combos[0].properties['timeout-ms'] = 45

    const generated = generateKeymap(singleKeyLayout, parsed)

    expect(generated.code).toContain('// keep-combo-comment')
    expect(generated.code).toContain('timeout-ms = <45>;')
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

  test('localizes regeneration when combo structure changes', () => {
    const source = `
/ {
    combos {
        compatible = "zmk,combos";
        esc_combo: esc_combo {
            timeout-ms = <30>;
            key-positions = <0 1>;
            bindings = <&kp ESC>;
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
    parsed.combos.push({
      name: 'tab_combo',
      label: 'tab_combo',
      bind: '&tab_combo',
      properties: {
        'timeout-ms': 35,
        'key-positions': [0, 1],
        bindings: ['&kp TAB'],
        layers: [],
        'require-prior-idle-ms': 0,
        'slow-release': false
      },
      property_types: {
        'timeout-ms': 'int',
        'key-positions': 'token-array',
        bindings: 'bindings',
        layers: 'token-array',
        'require-prior-idle-ms': 'int',
        'slow-release': 'boolean'
      },
      property_order: [
        'timeout-ms',
        'key-positions',
        'bindings',
        'layers',
        'require-prior-idle-ms',
        'slow-release'
      ],
      children: []
    })

    const generated = generateKeymap(singleKeyLayout, parsed)

    expect(generated.code).toContain('// keep-layer-comment')
    expect(generated.code).toContain('tab_combo: tab_combo')
  })

  test('preserves comments in conditional layer definition when property value is updated', () => {
    const source = `
/ {
    conditional_layers {
        nav_num: nav_num {
            // keep-conditional-layer-comment
            if-layers = <1 2>;
            then-layer = <3>;
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
    parsed.conditional_layers[0].properties['then-layer'] = 4

    const generated = generateKeymap(singleKeyLayout, parsed)

    expect(generated.code).toContain('// keep-conditional-layer-comment')
    expect(generated.code).toContain('then-layer = <4>;')
  })

  test('localizes regeneration when conditional layer section is inserted', () => {
    const source = `
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
    parsed.conditional_layers = [
      {
        name: 'nav_num',
        label: 'nav_num',
        bind: '&nav_num',
        properties: {
          'if-layers': [1, 2],
          'then-layer': 3
        },
        property_types: {
          'if-layers': 'token-array',
          'then-layer': 'int'
        },
        property_order: ['if-layers', 'then-layer'],
        children: []
      }
    ]

    const generated = generateKeymap(singleKeyLayout, parsed)

    expect(generated.code).toContain('// keep-layer-comment')
    expect(generated.code).toContain('conditional_layers {')
    expect(generated.code).toContain('nav_num: nav_num')
  })

  test('matches existing tab indentation when conditional layer section is inserted', () => {
    const source = `
/ {
\tmacros {
\t\tmacro_a: macro_a {
\t\t\tcompatible = "zmk,behavior-macro";
\t\t\t#binding-cells = <0>;
\t\t\tbindings = <&kp A>;
\t\t};
\t};

\tkeymap {
\t\tcompatible = "zmk,keymap";
\t\tdefault_layer {
\t\t\tbindings = <&kp A>;
\t\t};
\t};
};
`

    const parsed = parseKeymap(parseKeymapCode(source))
    parsed.conditional_layers = [
      {
        name: 'nav_num',
        label: 'nav_num',
        bind: '&nav_num',
        properties: {
          'if-layers': [1, 2],
          'then-layer': 3
        },
        property_types: {
          'if-layers': 'token-array',
          'then-layer': 'int'
        },
        property_order: ['if-layers', 'then-layer'],
        children: []
      }
    ]

    const generated = generateKeymap(singleKeyLayout, parsed)

    expect(generated.code).toMatch(/\n\tconditional_layers \{/)
    expect(generated.code).toMatch(/\n\t\tnav_num: nav_num \{/)
    expect(generated.code).toMatch(/\n\tkeymap \{/)
  })

  test('localizes regeneration when conditional layer section is removed', () => {
    const source = `
/ {
    conditional_layers {
        nav_num: nav_num {
            if-layers = <1 2>;
            then-layer = <3>;
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
    parsed.conditional_layers = []

    const generated = generateKeymap(singleKeyLayout, parsed)

    expect(generated.code).toContain('// keep-layer-comment')
    expect(generated.code).not.toContain('conditional_layers {')
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

  test('keeps non-numeric angle expressions in override properties during full regeneration', () => {
    const source = `
#include <dt-bindings/zmk/keys.h>

&trackball {
    workspace_actions {
        layers = <0>;
        modifiers = <(MOD_LCTL)>;
        bindings = <&kp A>, <&kp B>, <&kp C>, <&kp D>;
    };
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
    delete parsed.__keymap_editor
    parsed.layers[0][0] = parseKeyBinding('&kp B')

    const generated = generateKeymap(singleKeyLayout, parsed)

    expect(generated.code).toContain('modifiers = <(MOD_LCTL)>;')
    expect(generated.code).not.toContain('modifiers = <NaN>;')
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

  test('adds required includes when combo binding introduces a new behavior include', () => {
    const source = `
#include <dt-bindings/zmk/keys.h>

/ {
    combos {
        compatible = "zmk,combos";
        esc_combo: esc_combo {
            timeout-ms = <30>;
            key-positions = <0 1>;
            bindings = <&kp ESC>;
        };
    };

    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <&kp A>;
        };
    };
};
`

    const parsed = parseKeymap(parseKeymapCode(source))
    parsed.combos[0].properties.bindings = ['&bt BT_SEL 0']

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
    expect(generated.code).toContain('bindings = <&bt BT_SEL 0>;')
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
