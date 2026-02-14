import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import BehaviorEditor from './BehaviorEditor'

function createBehaviorType () {
  return {
    compatible: 'zmk,behavior-macro',
    displayName: 'Macro',
    propertyTypes: {
      compatible: 'string',
      '#binding-cells': 'int',
      bindings: 'bindings'
    },
    propertySpecs: {
      compatible: {
        type: 'string',
        required: true,
        fixed: 'zmk,behavior-macro'
      },
      '#binding-cells': {
        type: 'int',
        required: true,
        fixed: 0
      },
      bindings: {
        type: 'behavior-bindings',
        required: true,
        minItems: 1
      }
    },
    overrideBinds: [],
    overridePropertyKeys: []
  }
}

function createModMorphBehaviorType () {
  return {
    compatible: 'zmk,behavior-mod-morph',
    displayName: 'Mod-Morph',
    propertyTypes: {
      compatible: 'string',
      '#binding-cells': 'int',
      bindings: 'bindings',
      mods: 'token-array',
      'keep-mods': 'token-array'
    },
    propertySpecs: {
      compatible: {
        type: 'string',
        required: true,
        fixed: 'zmk,behavior-mod-morph'
      },
      '#binding-cells': {
        type: 'int',
        required: true,
        fixed: 0
      },
      bindings: {
        type: 'behavior-bindings',
        required: true,
        minItems: 2
      },
      mods: {
        type: 'token-array',
        required: true
      },
      'keep-mods': {
        type: 'token-array'
      }
    },
    overrideBinds: [],
    overridePropertyKeys: []
  }
}

function createDefinitionNode () {
  return {
    label: 'macro_test',
    name: 'macro_test_node',
    bind: '&macro_test',
    compatible: 'zmk,behavior-macro',
    properties: {
      compatible: 'zmk,behavior-macro',
      '#binding-cells': 0,
      bindings: ['&kp A']
    },
    property_types: {
      compatible: 'string',
      '#binding-cells': 'int',
      bindings: 'bindings'
    },
    property_order: ['compatible', '#binding-cells', 'bindings'],
    children: []
  }
}

function createModMorphDefinitionNode () {
  return {
    label: 'mm_test',
    name: 'mm_test_node',
    bind: '&mm_test',
    compatible: 'zmk,behavior-mod-morph',
    properties: {
      compatible: 'zmk,behavior-mod-morph',
      '#binding-cells': 0,
      bindings: ['&kp A', '&kp B'],
      mods: ['(MOD_LGUI|MOD_RSFT)']
    },
    property_types: {
      compatible: 'string',
      '#binding-cells': 'int',
      bindings: 'bindings',
      mods: 'token-array'
    },
    property_order: ['compatible', '#binding-cells', 'bindings', 'mods'],
    children: []
  }
}

function createOverrideNode (overrides = {}) {
  return {
    label: null,
    name: '&mt',
    bind: '&mt',
    compatible: '',
    properties: {},
    property_types: {},
    property_order: [],
    children: [],
    ...overrides
  }
}

function renderEditor (options = {}) {
  const onUpdate = options.onUpdate || jest.fn()
  const keymap = {
    layer_names: options.layerNames || ['Base', 'Nav', 'Fn'],
    layers: [],
    sensor_layers: [],
    behavior_definitions: options.behaviorDefinitions || [createDefinitionNode()],
    behavior_overrides: options.behaviorOverrides || []
  }

  const view = render(
    <BehaviorEditor
      keymap={keymap}
      behaviorTypes={options.behaviorTypes || [createBehaviorType()]}
      availableBehaviours={options.availableBehaviours || [
        { code: '&none', name: 'None' },
        { code: '&kp', name: 'Key Press' }
      ]}
      keycodes={options.keycodes || []}
      onUpdate={onUpdate}
    />
  )

  return { onUpdate, ...view }
}

describe('BehaviorEditor children DSL', () => {
  test('shows section headings for required and optional known properties', () => {
    renderEditor()

    expect(screen.getByText('Required Properties')).toBeTruthy()
    expect(screen.getByText('Optional Properties')).toBeTruthy()
    expect(screen.getByText('Add Known Properties')).toBeTruthy()
  })

  test('shows parse errors live and keeps formatter disabled', () => {
    const { onUpdate } = renderEditor()

    const textarea = screen.getByLabelText('Children (.keymap)')
    const formatButton = screen.getByRole('button', { name: 'Format' })

    fireEvent.change(textarea, { target: { value: 'broken_node { value = <1>;' } })
    fireEvent.blur(textarea)

    expect(screen.getByText(/Invalid children snippet/i)).toBeTruthy()
    expect(formatButton.disabled).toBe(true)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  test('applies valid DSL to behavior definition children on blur', () => {
    const { onUpdate } = renderEditor()

    const textarea = screen.getByLabelText('Children (.keymap)')

    fireEvent.change(textarea, {
      target: {
        value: 'child_label: child_node { bindings = <&kp B>; };'
      }
    })
    fireEvent.blur(textarea)

    expect(onUpdate).toHaveBeenCalledTimes(1)
    const nextKeymap = onUpdate.mock.calls[0][0]
    expect(nextKeymap.behavior_definitions[0].children).toHaveLength(1)
    expect(nextKeymap.behavior_definitions[0].children[0].label).toBe('child_label')
    expect(nextKeymap.behavior_definitions[0].children[0].name).toBe('child_node')
  })

  test('allows custom override name even when known override choices exist', () => {
    const { onUpdate } = renderEditor({
      behaviorDefinitions: [],
      behaviorOverrides: [createOverrideNode({ name: '&custom', bind: '&custom' })],
      behaviorTypes: [{
        ...createBehaviorType(),
        overrideBinds: ['&mt']
      }]
    })

    expect(screen.queryByText('Override 1: known override is required')).toBeNull()
    expect(screen.getByRole('option', { name: '(custom)' })).toBeTruthy()

    const knownOverrideSelect = screen.getByRole('combobox')
    fireEvent.change(knownOverrideSelect, { target: { value: '&mt' } })

    expect(onUpdate).toHaveBeenCalledTimes(1)
    const nextKeymap = onUpdate.mock.calls[0][0]
    expect(nextKeymap.behavior_overrides[0].name).toBe('&mt')
    expect(nextKeymap.behavior_overrides[0].bind).toBe('&mt')
  })

  test('uses node compatible fallback in required compatible select', () => {
    const node = createDefinitionNode()
    delete node.properties.compatible
    delete node.property_types.compatible
    node.property_order = node.property_order.filter(key => key !== 'compatible')

    renderEditor({ behaviorDefinitions: [node] })

    const compatibleOption = screen.getByRole('option', { name: 'Macro (zmk,behavior-macro)' })
    const compatibleSelect = compatibleOption.parentElement
    expect(compatibleSelect.value).toBe('zmk,behavior-macro')
  })

  test('hides compatible from raw properties and blocks renaming raw key to compatible', () => {
    const node = createDefinitionNode()
    node.properties.custom_raw = 'value'
    node.property_types.custom_raw = 'string'
    node.property_order.push('custom_raw')

    const { onUpdate } = renderEditor({ behaviorDefinitions: [node] })
    const rawGroup = screen.getByText('Raw Properties').parentElement

    expect(rawGroup.querySelector('input[value="custom_raw"]')).toBeTruthy()
    expect(rawGroup.querySelector('input[value="compatible"]')).toBeNull()

    const customKeyInput = rawGroup.querySelector('input[value="custom_raw"]')
    fireEvent.change(customKeyInput, { target: { value: 'compatible' } })
    expect(onUpdate).not.toHaveBeenCalled()
  })

  test('uses ValuePicker when binding parameters have explicit choices', () => {
    const node = createDefinitionNode()
    node.properties.bindings = ['&to 0']

    const { onUpdate } = renderEditor({
      behaviorDefinitions: [node],
      availableBehaviours: [
        { code: '&none', name: 'None' },
        { code: '&to', name: 'To Layer', params: ['layer'] }
      ],
      layerNames: Array.from({ length: 30 }, (_, index) => `Layer_${index}`)
    })

    fireEvent.click(screen.getByLabelText('binding-param-picker-bindings-0-0'))
    const result = document.querySelector('li[data-result-index="12"]')
    expect(result).toBeTruthy()
    fireEvent.click(result)

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].behavior_definitions[0].properties.bindings).toEqual(['&to 12'])
  })

  test('shows space-separated parameter guidance when parameter choices are open-ended', () => {
    const node = createDefinitionNode()
    node.properties.bindings = ['&foo A B']

    const { onUpdate } = renderEditor({
      behaviorDefinitions: [node],
      availableBehaviours: [
        { code: '&none', name: 'None' },
        { code: '&foo', name: 'Foo', params: ['left', 'right'] }
      ]
    })

    expect(screen.getByText(/space-separated tokens/i)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('binding-params-manual-bindings-0'), {
      target: { value: 'C D' }
    })

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].behavior_definitions[0].properties.bindings).toEqual(['&foo C D'])
  })

  test('renders mod-morph mods as checkboxes and serializes selected mask', () => {
    const node = createModMorphDefinitionNode()
    const { onUpdate } = renderEditor({
      behaviorDefinitions: [node],
      behaviorTypes: [createModMorphBehaviorType()],
      availableBehaviours: [
        { code: '&none', name: 'None' },
        { code: '&kp', name: 'Key Press', params: ['code'] }
      ]
    })

    const lgui = screen.getByLabelText('mods-MOD_LGUI')
    const rsft = screen.getByLabelText('mods-MOD_RSFT')
    const lsft = screen.getByLabelText('mods-MOD_LSFT')
    expect(lgui.checked).toBe(true)
    expect(rsft.checked).toBe(true)
    expect(lsft.checked).toBe(false)
    expect(screen.getByText(/mods =/i)).toBeTruthy()

    fireEvent.click(lsft)

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].behavior_definitions[0].properties.mods).toEqual(['(MOD_LSFT|MOD_RSFT|MOD_LGUI)'])
  })

  test('renders mod-morph keep-mods as checkboxes and serializes selected mask', () => {
    const node = createModMorphDefinitionNode()
    node.properties['keep-mods'] = ['(MOD_LCTL|MOD_RALT)']
    node.property_types['keep-mods'] = 'token-array'
    node.property_order.push('keep-mods')

    const { onUpdate } = renderEditor({
      behaviorDefinitions: [node],
      behaviorTypes: [createModMorphBehaviorType()],
      availableBehaviours: [
        { code: '&none', name: 'None' },
        { code: '&kp', name: 'Key Press', params: ['code'] }
      ]
    })

    const lctl = screen.getByLabelText('keep-mods-MOD_LCTL')
    const ralt = screen.getByLabelText('keep-mods-MOD_RALT')
    const lgui = screen.getByLabelText('keep-mods-MOD_LGUI')
    expect(lctl.checked).toBe(true)
    expect(ralt.checked).toBe(true)
    expect(lgui.checked).toBe(false)
    expect(screen.getByText(/keep-mods =/i)).toBeTruthy()

    fireEvent.click(lgui)

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].behavior_definitions[0].properties['keep-mods']).toEqual(['(MOD_LCTL|MOD_RALT|MOD_LGUI)'])
  })
})
