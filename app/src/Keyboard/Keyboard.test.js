import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import Keyboard from './Keyboard'
import { DefinitionsContext } from '../providers'

jest.mock('./KeyboardLayout', () => function MockKeyboardLayout(props) {
  return (
    <div>
      <button type='button' onClick={() => props.onSelectKey(0)}>Select Key 0</button>
    </div>
  )
})

jest.mock('./LayerSelector', () => function MockLayerSelector(props) {
  return (
    <div>
      <button type='button' onClick={() => props.onRevertLayer(0)}>Revert Layer 0</button>
      <button type='button' onClick={() => props.onRevertLayer(1)}>Revert Layer 1</button>
    </div>
  )
})

jest.mock('./Keys/KeyEditPane', () => function MockKeyEditPane(props) {
  if (!props.selectedKey) {
    return null
  }

  return (
    <div>
      <div>{props.selectedKey.label}</div>
      {props.canDiscardChange && (
        <button type='button' onClick={props.onDiscardChange}>
          {props.discardLabel || 'Discard'}
        </button>
      )}
    </div>
  )
})

function createBinding(value, params = []) {
  return { value, params }
}

function renderKeyboard(options = {}) {
  const onUpdate = options.onUpdate || jest.fn()
  const layout = options.layout || [{ x: 0, y: 0, w: 1, h: 1, label: 'K1' }]
  const sensors = options.sensors || []
  const baseKeymap = options.baseKeymap || {
    layer_names: ['Base'],
    layers: [[createBinding('&kp', [createBinding('A')])]],
    sensor_layers: [],
    behavior_definitions: [],
    behavior_overrides: []
  }
  const keymap = options.keymap || baseKeymap

  const definitions = {
    keycodes: Object.assign([], {
      indexed: {
        A: { code: 'A' }
      }
    }),
    behaviours: Object.assign([
      { code: '&kp', name: 'Key Press', params: ['code'] },
      { code: '&none', name: 'None', params: [] }
    ], {
      indexed: {
        '&kp': { code: '&kp', name: 'Key Press', params: ['code'] },
        '&none': { code: '&none', name: 'None', params: [] }
      }
    })
  }

  render(
    <DefinitionsContext.Provider value={definitions}>
      <Keyboard
        layout={layout}
        sensors={sensors}
        baseKeymap={baseKeymap}
        keymap={keymap}
        onUpdate={onUpdate}
      />
    </DefinitionsContext.Provider>
  )

  return { onUpdate }
}

describe('Keyboard discard actions', () => {
  test('discards selected key binding back to base value', () => {
    const { onUpdate } = renderKeyboard({
      baseKeymap: {
        layer_names: ['Base'],
        layers: [[createBinding('&kp', [createBinding('A')])]],
        sensor_layers: [],
        behavior_definitions: [],
        behavior_overrides: []
      },
      keymap: {
        layer_names: ['Base'],
        layers: [[createBinding('&kp', [createBinding('B')])]],
        sensor_layers: [],
        behavior_definitions: [],
        behavior_overrides: []
      }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Select Key 0' }))
    fireEvent.click(screen.getByRole('button', { name: /Discard/i }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].layers[0][0]).toEqual(createBinding('&kp', [createBinding('A')]))
  })

  test('discards selected sensor binding back to base value', () => {
    const { onUpdate } = renderKeyboard({
      sensors: [{ name: 'S1', compatible: 'zmk,sensor' }],
      baseKeymap: {
        layer_names: ['Base'],
        layers: [[createBinding('&kp', [createBinding('A')])]],
        sensor_layers: [[createBinding('&none')]],
        behavior_definitions: [],
        behavior_overrides: []
      },
      keymap: {
        layer_names: ['Base'],
        layers: [[createBinding('&kp', [createBinding('A')])]],
        sensor_layers: [[createBinding('&kp', [createBinding('A')])]],
        behavior_definitions: [],
        behavior_overrides: []
      }
    })

    fireEvent.click(screen.getByText('S1').closest('button'))
    fireEvent.click(screen.getByRole('button', { name: /Discard/i }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].sensor_layers[0][0]).toEqual(createBinding('&none'))
  })

  test('reverts added layer by removing it', () => {
    const { onUpdate } = renderKeyboard({
      layout: [{ x: 0, y: 0, w: 1, h: 1, label: 'K1' }],
      baseKeymap: {
        layer_names: ['Base'],
        layers: [[createBinding('&kp', [createBinding('A')])]],
        sensor_layers: [],
        behavior_definitions: [],
        behavior_overrides: []
      },
      keymap: {
        layer_names: ['Base', 'Fn'],
        layers: [
          [createBinding('&kp', [createBinding('A')])],
          [createBinding('&trans')]
        ],
        sensor_layers: [],
        behavior_definitions: [],
        behavior_overrides: []
      }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Revert Layer 1' }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].layer_names).toEqual(['Base'])
    expect(onUpdate.mock.calls[0][0].layers).toHaveLength(1)
  })

  test('reverts existing layer back to base values', () => {
    const { onUpdate } = renderKeyboard({
      baseKeymap: {
        layer_names: ['Base'],
        layers: [[createBinding('&kp', [createBinding('A')])]],
        sensor_layers: [],
        behavior_definitions: [],
        behavior_overrides: []
      },
      keymap: {
        layer_names: ['Renamed'],
        layers: [[createBinding('&kp', [createBinding('B')])]],
        sensor_layers: [],
        behavior_definitions: [],
        behavior_overrides: []
      }
    })

    fireEvent.click(screen.getByRole('button', { name: 'Revert Layer 0' }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].layer_names[0]).toBe('Base')
    expect(onUpdate.mock.calls[0][0].layers[0][0]).toEqual(createBinding('&kp', [createBinding('A')]))
  })
})
