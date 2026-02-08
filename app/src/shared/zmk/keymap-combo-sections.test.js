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

const sourceWithComboSections = `
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

describe('keymap combo section support', () => {
  test('parses combo definitions from top-level combos section', () => {
    const parsed = parseKeymapCode(sourceWithComboSections)

    expect(parsed.combos).toHaveLength(1)
    expect(parsed.combos[0].name).toBe('esc_combo')
    expect(parsed.combos[0].property_types['key-positions']).toBe('token-array')
    expect(parsed.combos[0].properties['key-positions']).toEqual([1, 2])
    expect(parsed.combos[0].properties.layers).toEqual([0, 2])
    expect(parsed.combos[0].properties.bindings).toEqual(['&kp ESC'])
    expect(parsed.combos[0].properties['slow-release']).toBe(true)
  })

  test('template extraction inserts combo placeholder', () => {
    const parsed = parseKeymapCode(sourceWithComboSections)
    const template = parsed[EDITOR_METADATA_KEY]?.template || ''

    expect(template).toMatch(/\{\{\s*rendered_combo_definitions\s*\}\}/)
    expect(template).toMatch(/\{\{\s*rendered_macro_definitions\s*\}\}/)
    expect(template).toMatch(/\{\{\s*rendered_behavior_definitions\s*\}\}/)
  })

  test('renderer emits combos/macros/behaviors as sibling blocks in order', () => {
    const parsed = parseKeymap(parseKeymapCode(sourceWithComboSections))
    const generated = generateKeymap(layout, parsed, undefined, {
      behaviours,
      behaviourTypes: behaviorTypes
    })

    expect(generated.code).toMatch(/\n\s*combos\s*\{/)
    expect(generated.code).toMatch(/\n\s*macros\s*\{/)
    expect(generated.code).toMatch(/\n\s*behaviors\s*\{/)

    const comboIndex = generated.code.indexOf('    combos {')
    const macroIndex = generated.code.indexOf('    macros {')
    const behaviorIndex = generated.code.indexOf('    behaviors {')
    const keymapIndex = generated.code.indexOf('    keymap {')

    expect(comboIndex).toBeGreaterThan(-1)
    expect(macroIndex).toBeGreaterThan(-1)
    expect(behaviorIndex).toBeGreaterThan(-1)
    expect(keymapIndex).toBeGreaterThan(-1)
    expect(comboIndex).toBeLessThan(macroIndex)
    expect(macroIndex).toBeLessThan(behaviorIndex)
    expect(behaviorIndex).toBeLessThan(keymapIndex)
  })

  test('round-trips combo field values', () => {
    const parsed = parseKeymap(parseKeymapCode(sourceWithComboSections))
    const generated = generateKeymap(layout, parsed, undefined, {
      behaviours,
      behaviourTypes: behaviorTypes
    })
    const reparsed = parseKeymapCode(generated.code)

    expect(reparsed.combos[0].properties['timeout-ms']).toBe(35)
    expect(reparsed.combos[0].properties['key-positions']).toEqual([1, 2])
    expect(reparsed.combos[0].properties.layers).toEqual([0, 2])
    expect(reparsed.combos[0].properties.bindings).toEqual(['&kp ESC'])
    expect(reparsed.combos[0].properties['require-prior-idle-ms']).toBe(20)
    expect(reparsed.combos[0].properties['slow-release']).toBe(true)
  })
})
