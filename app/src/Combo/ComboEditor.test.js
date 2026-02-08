import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import ComboEditor from './ComboEditor'

function createCombo (overrides = {}) {
  return {
    name: 'combo_a',
    label: 'tab_combo',
    bind: '&combo_a',
    properties: {
      'timeout-ms': 30,
      'key-positions': [0, 1],
      bindings: ['&kp TAB'],
      layers: [0],
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
    behavior_overrides: [],
    behavior_definitions: [],
    combos: options.combos || [createCombo()]
  }

  const layout = options.layout || [
    { x: 0, y: 0, w: 1, h: 1, label: 'A' },
    { x: 1, y: 0, w: 1, h: 1, label: 'B' },
    { x: 2, y: 0, w: 1, h: 1, label: 'C' }
  ]

  render(
    <ComboEditor
      keymap={keymap}
      layout={layout}
      availableBehaviours={options.availableBehaviours || [
        { code: '&none', name: 'None' },
        { code: '&kp', name: 'Key Press' },
        { code: '&bt', name: 'Bluetooth' }
      ]}
      keycodes={options.keycodes || []}
      onUpdate={onUpdate}
    />
  )

  return { onUpdate }
}

describe('ComboEditor', () => {
  test('adds and deletes combos', () => {
    const { onUpdate } = renderEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Add Combo' }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].combos).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Selected' }))

    expect(onUpdate).toHaveBeenCalledTimes(2)
  })

  test('updates key-positions from keyboard selection', () => {
    const { onUpdate } = renderEditor()

    fireEvent.click(screen.getByRole('button', { name: 'C' }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].combos[0].properties['key-positions']).toEqual([0, 1, 2])
  })

  test('blocks invalid key-positions updates', () => {
    const { onUpdate } = renderEditor()

    fireEvent.change(screen.getByLabelText('key-positions'), { target: { value: '0' } })

    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText(/key-positions must contain at least two indices/i)).toBeTruthy()
  })

  test('blocks invalid numeric updates', () => {
    const { onUpdate } = renderEditor()

    fireEvent.change(screen.getByLabelText('timeout-ms'), { target: { value: '-1' } })

    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText(/timeout-ms must be a non-negative integer/i)).toBeTruthy()
  })

  test('shows persisted validation for invalid binding count', () => {
    renderEditor({
      combos: [createCombo({
        properties: {
          'timeout-ms': 30,
          'key-positions': [0, 1],
          bindings: ['&kp TAB', '&kp ESC'],
          layers: [],
          'require-prior-idle-ms': 0,
          'slow-release': false
        }
      })]
    })

    expect(screen.getByText(/bindings must contain exactly one behavior binding/i)).toBeTruthy()
  })

  test('shows behavior-specific parameter dropdown and updates binding', () => {
    const { onUpdate } = renderEditor({
      combos: [createCombo({
        properties: {
          'timeout-ms': 30,
          'key-positions': [0, 1],
          bindings: ['&to 0'],
          layers: [],
          'require-prior-idle-ms': 0,
          'slow-release': false
        }
      })],
      availableBehaviours: [
        { code: '&none', name: 'None' },
        { code: '&to', name: 'To Layer', params: ['layer'] }
      ]
    })

    fireEvent.change(screen.getByLabelText('binding-param-0'), { target: { value: '1' } })

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].combos[0].properties.bindings).toEqual(['&to 1'])
  })

  test('uses ValuePicker for large parameter option sets', () => {
    const { onUpdate } = renderEditor({
      combos: [createCombo({
        properties: {
          'timeout-ms': 30,
          'key-positions': [0, 1],
          bindings: ['&to 0'],
          layers: [],
          'require-prior-idle-ms': 0,
          'slow-release': false
        }
      })],
      availableBehaviours: [
        { code: '&none', name: 'None' },
        { code: '&to', name: 'To Layer', params: ['layer'] }
      ],
      layerNames: Array.from({ length: 30 }, (_, index) => `Layer_${index}`)
    })

    fireEvent.click(screen.getByLabelText('binding-param-0'))
    const result = document.querySelector('li[data-result-index="15"]')
    expect(result).toBeTruthy()
    fireEvent.click(result)

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].combos[0].properties.bindings).toEqual(['&to 15'])
  })
})
