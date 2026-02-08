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
    layers: [],
    sensor_layers: [],
    behavior_definitions: options.behaviorDefinitions || [createDefinitionNode()],
    behavior_overrides: options.behaviorOverrides || []
  }

  const view = render(
    <BehaviorEditor
      keymap={keymap}
      behaviorTypes={options.behaviorTypes || [createBehaviorType()]}
      availableBehaviours={[
        { code: '&none', name: 'None' },
        { code: '&kp', name: 'Key Press' }
      ]}
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

  test('shows parse errors live and disables apply', () => {
    renderEditor()

    const textarea = screen.getByLabelText('Children (.keymap)')
    const applyButton = screen.getByRole('button', { name: 'Apply Children' })

    fireEvent.change(textarea, { target: { value: 'broken_node { value = <1>;' } })

    expect(screen.getByText(/Invalid children snippet/i)).toBeTruthy()
    expect(applyButton.disabled).toBe(true)
  })

  test('applies valid DSL to behavior definition children', () => {
    const { onUpdate } = renderEditor()

    const textarea = screen.getByLabelText('Children (.keymap)')
    const applyButton = screen.getByRole('button', { name: 'Apply Children' })

    fireEvent.change(textarea, {
      target: {
        value: 'child_label: child_node { bindings = <&kp B>; };'
      }
    })

    expect(applyButton.disabled).toBe(false)
    fireEvent.click(applyButton)

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
})
