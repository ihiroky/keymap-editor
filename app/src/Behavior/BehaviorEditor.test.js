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

function renderEditor (onUpdate = jest.fn()) {
  const keymap = {
    layers: [],
    sensor_layers: [],
    behavior_definitions: [createDefinitionNode()],
    behavior_overrides: []
  }

  render(
    <BehaviorEditor
      keymap={keymap}
      behaviorTypes={[createBehaviorType()]}
      availableBehaviours={[
        { code: '&none', name: 'None' },
        { code: '&kp', name: 'Key Press' }
      ]}
      onUpdate={onUpdate}
    />
  )

  return { onUpdate }
}

describe('BehaviorEditor children DSL', () => {
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
})
