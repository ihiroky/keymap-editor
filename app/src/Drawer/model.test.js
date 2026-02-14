import {
  buildLayerRenderModel,
  formatBindingLabel,
  formatKeyBindingDisplay,
  isComboVisibleOnLayer,
  normalizeComboLayers,
  resolveLayerMove
} from './model'

const baseLayout = [
  { x: 0, y: 0, w: 1, h: 1 },
  { x: 1, y: 0, w: 1, h: 1 },
  { x: 2, y: 0, w: 1, h: 1 }
]

const baseKeycodes = [
  { code: 'A', symbol: 'A' },
  { code: 'TAB', symbol: 'TAB' },
  { code: 'SPACE', symbol: 'SPACE' },
  { code: 'LEFT_SHIFT', symbol: '⇧' }
]

const baseBehaviours = [
  { code: '&kp', name: 'Key Press' },
  { code: '&lt', name: 'Layer Tap' },
  { code: '&mo', name: 'Momentary Layer' },
  { code: '&to', name: 'To Layer' },
  { code: '&tog', name: 'Toggle Layer' },
  { code: '&sl', name: 'Sticky Layer' },
  { code: '&mkp', name: 'Mouse Press' },
  { code: '&trans', name: 'Transparent' },
  { code: '&none', name: 'None' }
]

const baseBehaviourTypes = [
  {
    compatible: 'zmk,behavior-hold-tap',
    overrideBinds: ['&mt', '&lt']
  }
]

function createKeymap(overrides = {}) {
  return {
    layer_names: ['Base', 'Fn', 'Num', 'Nav', 'Mouse', 'Scroll', 'Sys'],
    layers: [
      ['&kp A', '&lt 1 TAB', '&mo 2']
    ],
    combos: [],
    behavior_overrides: [],
    behavior_definitions: [],
    ...overrides
  }
}

describe('Drawer model', () => {
  test('normalizeComboLayers and visibility checks', () => {
    const combo = {
      properties: {
        layers: [0, '2', 2, -1, 'abc']
      }
    }

    expect(normalizeComboLayers(combo)).toEqual([0, 2])
    expect(isComboVisibleOnLayer(combo, 2)).toBe(true)
    expect(isComboVisibleOnLayer(combo, 1)).toBe(false)
    expect(isComboVisibleOnLayer({ properties: { layers: [] } }, 9)).toBe(true)
  })

  test('resolves direct layer move behaviors', () => {
    const keymap = createKeymap()

    expect(resolveLayerMove('&lt 1 TAB', keymap, baseBehaviourTypes)).toEqual({
      trigger: '&lt',
      targetLayer: 1
    })

    expect(resolveLayerMove('&mo 2', keymap, baseBehaviourTypes)).toEqual({
      trigger: '&mo',
      targetLayer: 2
    })

    expect(resolveLayerMove('&to 3', keymap, baseBehaviourTypes)).toEqual({
      trigger: '&to',
      targetLayer: 3
    })

    expect(resolveLayerMove('&tog 4', keymap, baseBehaviourTypes)).toEqual({
      trigger: '&tog',
      targetLayer: 4
    })

    expect(resolveLayerMove('&sl 5', keymap, baseBehaviourTypes)).toEqual({
      trigger: '&sl',
      targetLayer: 5
    })
  })

  test('resolves custom hold-tap and nested macro layer moves', () => {
    const keymap = createKeymap({
      behavior_definitions: [
        {
          name: 'to_layer_0',
          bind: '&to_layer_0',
          properties: {
            compatible: 'zmk,behavior-macro-one-param',
            bindings: ['&to 0', '&macro_param_1to1', '&kp MACRO_PLACEHOLDER']
          }
        },
        {
          name: 'lt_to_layer_0',
          bind: '&lt_to_layer_0',
          properties: {
            compatible: 'zmk,behavior-hold-tap',
            bindings: ['&mo', '&to_layer_0']
          }
        }
      ]
    })

    expect(resolveLayerMove('&lt_to_layer_0 6 INT_HENKAN', keymap, baseBehaviourTypes)).toEqual({
      trigger: '&lt',
      targetLayer: 6
    })

    expect(resolveLayerMove('&to_layer_0 INT_MUHENKAN', keymap, baseBehaviourTypes)).toEqual({
      trigger: '&to',
      targetLayer: 0
    })
  })

  test('formats labels and builds layer model safely with invalid combos', () => {
    const keymap = createKeymap({
      combos: [
        {
          properties: {
            bindings: ['&kp TAB'],
            'key-positions': [0, 1],
            layers: []
          }
        },
        {
          properties: {
            bindings: ['&kp TAB'],
            'key-positions': [999],
            layers: []
          }
        }
      ]
    })

    expect(formatBindingLabel('&kp TAB', baseKeycodes, baseBehaviours)).toBe('TAB')
    expect(formatBindingLabel('&trans', baseKeycodes, baseBehaviours)).toBe('▽')
    expect(formatBindingLabel('&mkp MB1', baseKeycodes, baseBehaviours)).toBe('mkp MB1')

    expect(formatKeyBindingDisplay('&bootloader', baseKeycodes, baseBehaviours)).toEqual({
      tapLabel: '',
      behaviorLabel: 'bootloader',
      holdLabel: null
    })

    expect(formatKeyBindingDisplay('&mkp MB1', baseKeycodes, baseBehaviours)).toEqual({
      tapLabel: 'MB1',
      behaviorLabel: 'mkp',
      holdLabel: null
    })

    expect(formatKeyBindingDisplay('&mt LEFT_SHIFT A', baseKeycodes, baseBehaviours)).toEqual({
      tapLabel: '⇧ A',
      behaviorLabel: null,
      holdLabel: null
    })

    const model = buildLayerRenderModel({
      layout: baseLayout,
      keymap,
      layerIndex: 0,
      keycodes: baseKeycodes,
      behaviours: baseBehaviours,
      behaviourTypes: baseBehaviourTypes
    })

    expect(model.keys).toHaveLength(3)
    expect(model.keys[1].layerMove).toEqual({
      trigger: '&lt',
      targetLayer: 1,
      label: 'Fn',
      href: '#drawer-layer-1'
    })
    expect(model.keys[0]).toEqual(expect.objectContaining({
      behaviorLabel: null
    }))
    expect(model.combos).toHaveLength(1)
    expect(model.combos[0]).toEqual(expect.objectContaining({
      label: 'TAB',
      title: '&kp TAB'
    }))
  })

  test('returns null for invalid layer move input', () => {
    const keymap = createKeymap()

    expect(resolveLayerMove('&mo foo', keymap, baseBehaviourTypes)).toBeNull()
    expect(resolveLayerMove('not_a_binding', keymap, baseBehaviourTypes)).toBeNull()
  })

  test('marks keys as error when unresolved bindings remain in keymap and combos', () => {
    const keymap = createKeymap({
      layers: [
        ['&ghost', '&kp A', '&kp TAB']
      ],
      combos: [
        {
          name: 'broken_combo',
          bind: '&broken_combo',
          properties: {
            bindings: ['&missing_combo_binding'],
            'key-positions': [1, 2],
            layers: [0]
          }
        }
      ]
    })

    const model = buildLayerRenderModel({
      layout: baseLayout,
      keymap,
      layerIndex: 0,
      keycodes: baseKeycodes,
      behaviours: baseBehaviours,
      behaviourTypes: baseBehaviourTypes
    })

    expect(model.keys[0].hasError).toBe(true)
    expect(model.keys[0].errorMessage).toContain('Unresolved binding: &ghost')
    expect(model.keys[1].hasError).toBe(true)
    expect(model.keys[1].errorMessage).toContain('broken_combo')
    expect(model.keys[2].hasError).toBe(true)
    expect(model.keys[2].errorMessage).toContain('broken_combo')
    expect(model.combos[0].hasError).toBe(true)
    expect(model.combos[0].errorMessage).toContain('&missing_combo_binding')
  })
})
