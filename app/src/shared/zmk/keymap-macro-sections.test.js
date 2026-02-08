const { parseKeymapCode } = require('./keymap-code')
const { parseKeymap, generateKeymap, EDITOR_METADATA_KEY } = require('./keymap')

const behaviorTypes = [
  {
    compatible: 'zmk,behavior-macro',
    propertyTypes: {
      compatible: 'string',
      '#binding-cells': 'int',
      bindings: 'bindings'
    }
  },
  {
    compatible: 'zmk,behavior-tap-dance',
    propertyTypes: {
      compatible: 'string',
      '#binding-cells': 'int',
      bindings: 'bindings'
    }
  }
]

const behaviours = [
  { code: '&none', includes: [] },
  { code: '&kp', includes: [] },
  { code: '&td0', includes: [] }
]

const layout = [{ row: 0, col: 0 }]

const sourceWithSiblingSections = `
/ {
    macros {
        macro_a: macro_a {
            compatible = "zmk,behavior-macro";
            #binding-cells = <0>;
            bindings = <&kp A>;
        };
    };

    behaviors {
        td0: td0 {
            compatible = "zmk,behavior-tap-dance";
            #binding-cells = <0>;
            bindings = <&kp A>, <&kp B>;
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

describe('keymap macro section support', () => {
  test('parses macro definitions from top-level macros section', () => {
    const parsed = parseKeymapCode(sourceWithSiblingSections)

    expect(parsed.behavior_definitions).toHaveLength(2)
    expect(parsed.behavior_definitions[0].properties.compatible).toBe('zmk,behavior-macro')
    expect(parsed.behavior_definitions[0].property_types.bindings).toBe('bindings')
    expect(parsed.behavior_definitions[0].properties.bindings).toEqual([
      '&kp A'
    ])
    expect(parsed.behavior_definitions[1].properties.compatible).toBe('zmk,behavior-tap-dance')
  })

  test('template extraction inserts macro placeholder', () => {
    const parsed = parseKeymapCode(sourceWithSiblingSections)
    const template = parsed[EDITOR_METADATA_KEY]?.template || ''

    expect(template).toMatch(/\{\{\s*rendered_macro_definitions\s*\}\}/)
    expect(template).toMatch(/\{\{\s*rendered_behavior_definitions\s*\}\}/)
  })

  test('renderer emits macros and behaviors as sibling blocks', () => {
    const parsed = parseKeymap(parseKeymapCode(sourceWithSiblingSections))
    const generated = generateKeymap(layout, parsed, undefined, {
      behaviours,
      behaviourTypes: behaviorTypes
    })

    expect(generated.code).toMatch(/\n\s*macros\s*\{/)
    expect(generated.code).toMatch(/\n\s*behaviors\s*\{/)

    const macroIndex = generated.code.indexOf('    macros {')
    const behaviorIndex = generated.code.indexOf('    behaviors {')
    const keymapIndex = generated.code.indexOf('    keymap {')

    expect(macroIndex).toBeGreaterThan(-1)
    expect(behaviorIndex).toBeGreaterThan(-1)
    expect(keymapIndex).toBeGreaterThan(-1)
    expect(macroIndex).toBeLessThan(behaviorIndex)
    expect(behaviorIndex).toBeLessThan(keymapIndex)
  })

  test('single-angle macro bindings with multiple behaviors are parsed as bindings list', () => {
    const parsed = parseKeymapCode(`
/ {
    macros {
        to_layer_0: to_layer_0 {
            compatible = "zmk,behavior-macro-one-param";
            #binding-cells = <1>;
            bindings = <&to 0 &macro_param_1to1 &kp MACRO_PLACEHOLDER>;
        };
    };

    keymap {
        compatible = "zmk,keymap";
        default_layer {
            bindings = <&none>;
        };
    };
};
`)

    expect(parsed.behavior_definitions).toHaveLength(1)
    expect(parsed.behavior_definitions[0].property_types.bindings).toBe('bindings')
    expect(parsed.behavior_definitions[0].properties.bindings).toEqual([
      '&to 0',
      '&macro_param_1to1',
      '&kp MACRO_PLACEHOLDER'
    ])

    const generated = generateKeymap(layout, parseKeymap(parsed), undefined, {
      behaviours,
      behaviourTypes: behaviorTypes
    })
    expect(generated.code).not.toContain('<NaN>')
  })
})
