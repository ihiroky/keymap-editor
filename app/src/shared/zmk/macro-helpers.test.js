const {
  ensureBindingArray,
  isMacroDefinition,
  mergeBehaviorDefinitions,
  parseMacroBinding,
  parseRawMacroBindings,
  renderMacroBinding,
  renderRawMacroBindings,
  splitBehaviorDefinitions,
  validateMacroCollection,
  validateMacroNode
} = require('./macro-helpers')

function createMacroNode (overrides = {}) {
  return {
    label: 'macro_test',
    name: 'macro_test_node',
    bind: '&macro_test',
    compatible: 'zmk,behavior-macro-two-param',
    properties: {
      compatible: 'zmk,behavior-macro-two-param',
      '#binding-cells': 2,
      bindings: ['&macro_tap', '&kp A', '&macro_param_2to1'],
      'tap-ms': 80
    },
    property_types: {
      compatible: 'string',
      '#binding-cells': 'int',
      bindings: 'bindings',
      'tap-ms': 'int'
    },
    property_order: ['compatible', '#binding-cells', 'bindings', 'tap-ms'],
    children: [],
    ...overrides
  }
}

describe('macro shared helpers', () => {
  test('parses and renders macro control bindings', () => {
    expect(parseMacroBinding('&macro_tap')).toEqual({
      type: 'mode-control',
      control: '&macro_tap',
      raw: '&macro_tap'
    })

    expect(parseMacroBinding('&macro_wait_time 30')).toEqual({
      type: 'time-control',
      control: '&macro_wait_time',
      value: '30',
      raw: '&macro_wait_time 30'
    })

    expect(parseMacroBinding('&macro_param_1to2')).toEqual({
      type: 'param-forward-control',
      control: '&macro_param_1to2',
      raw: '&macro_param_1to2'
    })

    expect(parseMacroBinding('&kp A')).toEqual({
      type: 'behavior',
      behavior: '&kp',
      paramsText: 'A',
      raw: '&kp A'
    })

    expect(renderMacroBinding({ type: 'time-control', control: '&macro_tap_time', value: '40' })).toBe('&macro_tap_time 40')
    expect(renderMacroBinding({ type: 'behavior', behavior: '&kp', paramsText: 'B' })).toBe('&kp B')
  })

  test('raw binding helpers split and join lines', () => {
    const parsed = parseRawMacroBindings('&kp A\n\n&macro_tap\n')
    expect(parsed).toEqual(['&kp A', '&macro_tap'])

    const rendered = renderRawMacroBindings(parsed)
    expect(rendered).toBe('&kp A\n&macro_tap')
  })

  test('validates fixed binding-cells and parameter forwarding compatibility', () => {
    const invalid = createMacroNode({
      properties: {
        compatible: 'zmk,behavior-macro-one-param',
        '#binding-cells': 0,
        bindings: ['&macro_param_2to1'],
        'tap-ms': -1
      }
    })

    const errors = validateMacroNode(invalid)
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/#binding-cells/),
      expect.stringMatching(/requires macro binding-cells >= 2/),
      expect.stringMatching(/tap-ms must be a non-negative integer/)
    ]))
  })

  test('validates unknown macro controls and argument counts', () => {
    const invalid = createMacroNode({
      properties: {
        compatible: 'zmk,behavior-macro',
        '#binding-cells': 0,
        bindings: ['&macro_tap X', '&macro_wait_time', '&macro_unknown']
      }
    })

    const errors = validateMacroNode(invalid)
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/does not accept arguments/),
      expect.stringMatching(/requires one non-negative integer argument/),
      expect.stringMatching(/unknown macro control/)
    ]))
  })

  test('splits and merges definitions by macro kind', () => {
    const macroA = createMacroNode({ label: 'macro_a', bind: '&macro_a' })
    const macroB = createMacroNode({ label: 'macro_b', bind: '&macro_b' })
    const behavior = {
      label: 'td',
      name: 'td_node',
      bind: '&td',
      compatible: 'zmk,behavior-tap-dance',
      properties: {
        compatible: 'zmk,behavior-tap-dance',
        '#binding-cells': 0,
        bindings: ['&kp A', '&kp B']
      }
    }

    const list = [macroA, behavior, macroB]
    const split = splitBehaviorDefinitions(list)
    expect(split.macroDefinitions).toEqual([macroA, macroB])
    expect(split.behaviorDefinitions).toEqual([behavior])
    expect(isMacroDefinition(macroA)).toBe(true)
    expect(isMacroDefinition(behavior)).toBe(false)

    const mergedBehavior = mergeBehaviorDefinitions(list, [{ ...behavior, label: 'td2' }], 'behavior')
    expect(mergedBehavior[1].label).toBe('td2')

    const mergedMacro = mergeBehaviorDefinitions(list, [{ ...macroA, label: 'mx' }], 'macro')
    expect(mergedMacro.find(node => node.bind === '&macro_a').label).toBe('mx')
    expect(mergedMacro.find(node => node.bind === '&macro_b')).toBeUndefined()
  })

  test('collects macro collection errors with prefixes', () => {
    const errors = validateMacroCollection([
      createMacroNode(),
      createMacroNode({ properties: { compatible: 'zmk,behavior-macro', '#binding-cells': 1, bindings: [] } })
    ])

    expect(errors.some(error => error.startsWith('Macro 2:'))).toBe(true)
  })

  test('normalizes binding arrays', () => {
    expect(ensureBindingArray('&kp A')).toEqual(['&kp A'])
    expect(ensureBindingArray('&kp A, &kp B')).toEqual(['&kp A', '&kp B'])
    expect(ensureBindingArray(['&kp A', '', ' &kp B '])).toEqual(['&kp A', '&kp B'])
  })
})
