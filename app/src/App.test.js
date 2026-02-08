import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import App from './App'

jest.mock('./keycodes', () => ({
  loadKeycodes: jest.fn(() => Promise.resolve([]))
}))

jest.mock('./api', () => ({
  loadBehaviours: jest.fn(() => Promise.resolve([])),
  loadBehaviourTypes: jest.fn(() => Promise.resolve([]))
}))

jest.mock('./Common/Loader', () => function MockLoader ({ children }) {
  return children
})

jest.mock('./Pickers/KeyboardPicker', () => function MockKeyboardPicker ({ onSelect }) {
  const React = require('react')

  React.useEffect(() => {
    onSelect({
      source: 'local',
      layout: [],
      sensors: [],
      keymap: {
        layer_names: ['Base'],
        layers: [[{ value: '&none', params: [] }]],
        sensor_layers: [],
        behavior_overrides: [],
        behavior_definitions: [
          {
            label: 'macro_a',
            name: 'macro_a_node',
            bind: '&macro_a',
            compatible: 'zmk,behavior-macro',
            properties: {
              compatible: 'zmk,behavior-macro',
              '#binding-cells': 0,
              bindings: ['&kp A']
            }
          },
          {
            label: 'td_a',
            name: 'td_a_node',
            bind: '&td_a',
            compatible: 'zmk,behavior-tap-dance',
            properties: {
              compatible: 'zmk,behavior-tap-dance',
              '#binding-cells': 0,
              bindings: ['&kp A', '&kp B']
            }
          }
        ],
        combos: [
          {
            name: 'combo_a',
            properties: {
              'timeout-ms': 30,
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
          }
        ]
      }
    })
  }, [onSelect])

  return <div>Picker Mock</div>
})

jest.mock('./Keyboard/Keyboard', () => function MockKeyboard () {
  return <div>Keyboard Mock</div>
})

let mockLastBehaviorProps = null
let mockLastMacroProps = null
let mockLastComboProps = null

jest.mock('./Behavior/BehaviorEditor', () => function MockBehaviorEditor (props) {
  mockLastBehaviorProps = props
  return (
    <button
      type='button'
      onClick={() => {
        const definition = props.keymap.behavior_definitions[0]
        props.onUpdate({
          ...props.keymap,
          behavior_definitions: [{ ...definition, label: 'td_updated' }]
        })
      }}
    >
      Behavior Update
    </button>
  )
})

jest.mock('./Macro/MacroEditor', () => function MockMacroEditor (props) {
  mockLastMacroProps = props
  return (
    <button
      type='button'
      onClick={() => {
        const definition = props.keymap.behavior_definitions[0]
        props.onUpdate({
          ...props.keymap,
          behavior_definitions: [{ ...definition, label: 'macro_updated' }]
        })
      }}
    >
      Macro Update
    </button>
  )
})

jest.mock('./Combo/ComboEditor', () => function MockComboEditor (props) {
  mockLastComboProps = props
  return (
    <button
      type='button'
      onClick={() => {
        const combo = props.keymap.combos[0]
        props.onUpdate({
          ...props.keymap,
          combos: [{ ...combo, name: 'combo_updated' }]
        })
      }}
    >
      Combo Update
    </button>
  )
})

describe('App macro/behavior split integration', () => {
  beforeEach(() => {
    mockLastBehaviorProps = null
    mockLastMacroProps = null
    mockLastComboProps = null
  })

  test('shows Macro/Combo tabs and splits editor keymap definitions', async () => {
    render(<App />)

    await screen.findByText('Keymap')
    fireEvent.click(screen.getByRole('button', { name: 'Behavior' }))

    await waitFor(() => {
      expect(mockLastBehaviorProps).toBeTruthy()
    })

    expect(mockLastBehaviorProps.keymap.behavior_definitions).toHaveLength(1)
    expect(mockLastBehaviorProps.keymap.behavior_definitions[0].compatible).toBe('zmk,behavior-tap-dance')

    fireEvent.click(screen.getByRole('button', { name: 'Macro' }))

    await waitFor(() => {
      expect(mockLastMacroProps).toBeTruthy()
    })

    expect(mockLastMacroProps.keymap.behavior_definitions).toHaveLength(1)
    expect(mockLastMacroProps.keymap.behavior_definitions[0].compatible).toBe('zmk,behavior-macro')

    fireEvent.click(screen.getByRole('button', { name: 'Combo' }))

    await waitFor(() => {
      expect(mockLastComboProps).toBeTruthy()
    })

    expect(mockLastComboProps.keymap.combos).toHaveLength(1)
    expect(mockLastComboProps.keymap.combos[0].name).toBe('combo_a')
  })

  test('preserves both definition groups when each editor updates', async () => {
    render(<App />)

    await screen.findByText('Keymap')

    fireEvent.click(screen.getByRole('button', { name: 'Macro' }))
    await waitFor(() => {
      expect(mockLastMacroProps).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Macro Update' }))

    fireEvent.click(screen.getByRole('button', { name: 'Behavior' }))
    await waitFor(() => {
      expect(mockLastBehaviorProps).toBeTruthy()
    })

    expect(mockLastBehaviorProps.keymap.behavior_definitions[0].label).toBe('td_a')

    fireEvent.click(screen.getByRole('button', { name: 'Behavior Update' }))

    fireEvent.click(screen.getByRole('button', { name: 'Combo' }))
    await waitFor(() => {
      expect(mockLastComboProps).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Combo Update' }))

    fireEvent.click(screen.getByRole('button', { name: 'Macro' }))
    await waitFor(() => {
      expect(mockLastMacroProps.keymap.behavior_definitions[0].label).toBe('macro_updated')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Behavior' }))
    await waitFor(() => {
      expect(mockLastBehaviorProps.keymap.behavior_definitions[0].label).toBe('td_updated')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Combo' }))
    await waitFor(() => {
      expect(mockLastComboProps.keymap.combos[0].name).toBe('combo_updated')
    })
  })
})
