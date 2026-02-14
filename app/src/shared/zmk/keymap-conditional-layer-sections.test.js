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

const sourceWithConditionalLayerSections = `
/ {
    combos {
        compatible = "zmk,combos";

        esc_combo: esc_combo {
            timeout-ms = <35>;
            key-positions = <1 2>;
            bindings = <&kp ESC>;
            layers = <0 2>;
            require-prior-idle-ms = <20>;
            slow-release;
        };
    };

    conditional_layers {
        nav_num: nav_num {
            if-layers = <1 2>;
            then-layer = <3>;
        };
    };

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

describe('keymap conditional layer section support', () => {
  test('parses conditional layer definitions from top-level conditional_layers section', () => {
    const parsed = parseKeymapCode(sourceWithConditionalLayerSections)

    expect(parsed.conditional_layers).toHaveLength(1)
    expect(parsed.conditional_layers[0].name).toBe('nav_num')
    expect(parsed.conditional_layers[0].property_types['if-layers']).toBe('token-array')
    expect(parsed.conditional_layers[0].properties['if-layers']).toEqual([1, 2])
    expect(parsed.conditional_layers[0].properties['then-layer']).toBe(3)
  })

  test('template extraction inserts conditional layer placeholder', () => {
    const parsed = parseKeymapCode(sourceWithConditionalLayerSections)
    const template = parsed[EDITOR_METADATA_KEY]?.template || ''

    expect(template).toMatch(/\{\{\s*rendered_combo_definitions\s*\}\}/)
    expect(template).toMatch(/\{\{\s*rendered_conditional_layer_definitions\s*\}\}/)
    expect(template).toMatch(/\{\{\s*rendered_macro_definitions\s*\}\}/)
    expect(template).toMatch(/\{\{\s*rendered_behavior_definitions\s*\}\}/)
  })

  test('renderer emits combos/conditional_layers/macros/behaviors as sibling blocks in order', () => {
    const parsed = parseKeymap(parseKeymapCode(sourceWithConditionalLayerSections))
    const generated = generateKeymap(layout, parsed, undefined, {
      behaviours,
      behaviorTypes
    })

    expect(generated.code).toMatch(/\n\s*combos\s*\{/)
    expect(generated.code).toMatch(/\n\s*conditional_layers\s*\{/)
    expect(generated.code).toContain('compatible = "zmk,conditional-layers";')
    expect(generated.code).toMatch(/\n\s*macros\s*\{/)
    expect(generated.code).toMatch(/\n\s*behaviors\s*\{/)

    const comboIndex = generated.code.indexOf('    combos {')
    const conditionalLayerIndex = generated.code.indexOf('    conditional_layers {')
    const macroIndex = generated.code.indexOf('    macros {')
    const behaviorIndex = generated.code.indexOf('    behaviors {')
    const keymapIndex = generated.code.indexOf('    keymap {')

    expect(comboIndex).toBeGreaterThan(-1)
    expect(conditionalLayerIndex).toBeGreaterThan(-1)
    expect(macroIndex).toBeGreaterThan(-1)
    expect(behaviorIndex).toBeGreaterThan(-1)
    expect(keymapIndex).toBeGreaterThan(-1)
    expect(comboIndex).toBeLessThan(conditionalLayerIndex)
    expect(conditionalLayerIndex).toBeLessThan(macroIndex)
    expect(macroIndex).toBeLessThan(behaviorIndex)
    expect(behaviorIndex).toBeLessThan(keymapIndex)
  })

  test('round-trips conditional layer field values', () => {
    const parsed = parseKeymap(parseKeymapCode(sourceWithConditionalLayerSections))
    const generated = generateKeymap(layout, parsed, undefined, {
      behaviours,
      behaviorTypes
    })
    const reparsed = parseKeymapCode(generated.code)

    expect(reparsed.conditional_layers[0].properties['if-layers']).toEqual([1, 2])
    expect(reparsed.conditional_layers[0].properties['then-layer']).toBe(3)
  })
})
