import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import ConditionalLayerEditor from './ConditionalLayerEditor'

function createRule (overrides = {}) {
  return {
    name: 'nav_num',
    label: 'nav_num',
    bind: '&nav_num',
    properties: {
      'if-layers': [1, 2],
      'then-layer': 3
    },
    property_types: {
      'if-layers': 'token-array',
      'then-layer': 'int'
    },
    property_order: ['if-layers', 'then-layer'],
    children: [],
    ...overrides
  }
}

function renderEditor (options = {}) {
  const onUpdate = options.onUpdate || jest.fn()
  const keymap = {
    layer_names: options.layerNames || ['Base', 'Nav', 'Fn', 'Num'],
    layers: options.layers || [[], [], [], []],
    sensor_layers: [],
    behavior_overrides: [],
    behavior_definitions: [],
    combos: [],
    conditional_layers: options.conditionalLayers || [createRule()]
  }
  const baseKeymap = options.baseKeymap || keymap

  const view = render(
    <ConditionalLayerEditor
      keymap={keymap}
      baseKeymap={baseKeymap}
      onUpdate={onUpdate}
    />
  )

  return { onUpdate, ...view }
}

describe('ConditionalLayerEditor', () => {
  let confirmSpy

  beforeEach(() => {
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    confirmSpy.mockRestore()
  })

  test('adds and deletes conditional layer rules', () => {
    const { onUpdate } = renderEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].conditional_layers).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Selected' }))

    expect(onUpdate).toHaveBeenCalledTimes(2)
    expect(confirmSpy).toHaveBeenCalledWith('Delete conditional layer rule "nav_num"? This cannot be undone.')
  })

  test('cancels deleting selected rule when confirmation is declined', () => {
    confirmSpy.mockReturnValue(false)
    const { onUpdate } = renderEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }))
    expect(onUpdate).toHaveBeenCalledTimes(1)
    onUpdate.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Selected' }))
    expect(onUpdate).not.toHaveBeenCalled()
  })

  test('updates if-layers and then-layer', () => {
    const { onUpdate } = renderEditor()

    fireEvent.change(screen.getByLabelText('if-layer-0'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('then-layer'), { target: { value: '3' } })

    expect(onUpdate).toHaveBeenCalledTimes(2)
    expect(onUpdate.mock.calls[0][0].conditional_layers[0].properties['if-layers']).toEqual([0, 2])
    expect(onUpdate.mock.calls[1][0].conditional_layers[0].properties['then-layer']).toBe(3)
  })

  test('shows named layers in pull-down options', () => {
    renderEditor({
      layerNames: ['Base Layer', 'Nav Layer', 'Fn Layer', 'Num Layer']
    })

    const optionLabels = screen.getAllByRole('option').map(option => option.textContent)
    expect(optionLabels).toContain('Base Layer')
    expect(optionLabels).toContain('Nav Layer')
    expect(optionLabels).toContain('Fn Layer')
    expect(optionLabels).toContain('Num Layer')
  })

  test('excludes conflicting layers from pull-down options', () => {
    renderEditor()

    const thenLayerOptions = Array.from(screen.getByLabelText('then-layer').querySelectorAll('option'))
      .map(option => option.value)
    expect(thenLayerOptions).not.toContain('1')
    expect(thenLayerOptions).not.toContain('2')

    const ifLayerOptions = Array.from(screen.getByLabelText('if-layer-0').querySelectorAll('option'))
      .map(option => option.value)
    expect(ifLayerOptions).not.toContain('3')
  })

  test('blocks duplicate if-layer values from pull-down changes', () => {
    const { onUpdate } = renderEditor()

    fireEvent.change(screen.getByLabelText('if-layer-0'), { target: { value: '2' } })
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText(/if-layers must not contain duplicates/i)).toBeTruthy()
  })

  test('shows persisted validation for out-of-range values', () => {
    renderEditor({
      conditionalLayers: [createRule({
        properties: {
          'if-layers': [1, 2],
          'then-layer': 99
        }
      })]
    })

    expect(screen.getByText(/then-layer 99 is out of range/i)).toBeTruthy()
  })

  test('normalizes conflicting initial values to keep at least two if-layers', () => {
    renderEditor({
      layers: [[], [], []],
      conditionalLayers: [createRule({
        properties: {
          'if-layers': [0],
          'then-layer': 0
        }
      })]
    })

    expect(screen.getByLabelText('if-layer-0').value).toBe('1')
    expect(screen.getByLabelText('if-layer-1').value).toBe('2')
    expect(screen.getByLabelText('remove-if-layer-0').disabled).toBe(true)
    expect(screen.getByLabelText('remove-if-layer-1').disabled).toBe(true)
  })

  test('disables Add Rule when layer count is less than three', () => {
    renderEditor({
      layers: [[], []]
    })

    expect(screen.getByRole('button', { name: 'Add Rule' }).disabled).toBe(true)
  })

  test('keeps unknown properties on update', () => {
    const { onUpdate } = renderEditor({
      conditionalLayers: [createRule({
        properties: {
          'if-layers': [1, 2],
          'then-layer': 3,
          extra: 'keep'
        },
        property_types: {
          'if-layers': 'token-array',
          'then-layer': 'int',
          extra: 'token'
        },
        property_order: ['if-layers', 'then-layer', 'extra']
      })]
    })

    fireEvent.change(screen.getByLabelText('then-layer'), { target: { value: '0' } })

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].conditional_layers[0].properties.extra).toBe('keep')
  })

  test('shows changed marker and summary against base keymap', () => {
    renderEditor({
      conditionalLayers: [createRule({
        properties: {
          'if-layers': [0, 1],
          'then-layer': 2
        }
      })],
      baseKeymap: {
        layer_names: ['Base', 'Nav', 'Fn', 'Num'],
        layers: [[], [], [], []],
        sensor_layers: [],
        behavior_overrides: [],
        behavior_definitions: [],
        combos: [],
        conditional_layers: [createRule()]
      }
    })

    const row = screen.getByLabelText('then-layer').closest('[data-changed]')
    expect(row).toBeTruthy()
    expect(row.getAttribute('data-changed')).toBe('true')
  })

  test('shows Added badge when rule is newly added', () => {
    renderEditor({
      conditionalLayers: [createRule(), createRule({ name: 'nav_num_2', bind: '&nav_num_2' })],
      baseKeymap: {
        layer_names: ['Base', 'Nav', 'Fn', 'Num'],
        layers: [[], [], [], []],
        sensor_layers: [],
        behavior_overrides: [],
        behavior_definitions: [],
        combos: [],
        conditional_layers: [createRule()]
      }
    })

    expect(screen.getByText('Added')).toBeTruthy()
    expect(screen.getByText(/\+1 \/ Deleted 0/i)).toBeTruthy()
  })

  test('discards changed rule row back to base value', () => {
    const { onUpdate } = renderEditor({
      conditionalLayers: [createRule({ name: 'changed_rule', bind: '&changed_rule' })],
      baseKeymap: {
        layer_names: ['Base', 'Nav', 'Fn', 'Num'],
        layers: [[], [], [], []],
        sensor_layers: [],
        behavior_overrides: [],
        behavior_definitions: [],
        combos: [],
        conditional_layers: [createRule()]
      }
    })

    fireEvent.click(screen.getByLabelText(/Discard conditional rule changes/i))
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].conditional_layers[0].name).toBe('nav_num')
  })

  test('discards added rule row by removing it', () => {
    const { onUpdate } = renderEditor({
      conditionalLayers: [createRule(), createRule({ name: 'nav_num_2', bind: '&nav_num_2' })],
      baseKeymap: {
        layer_names: ['Base', 'Nav', 'Fn', 'Num'],
        layers: [[], [], [], []],
        sensor_layers: [],
        behavior_overrides: [],
        behavior_definitions: [],
        combos: [],
        conditional_layers: [createRule()]
      }
    })

    fireEvent.click(screen.getByLabelText(/Discard conditional rule changes nav_num_2/i))
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].conditional_layers).toHaveLength(1)
    expect(confirmSpy).toHaveBeenCalledWith('Remove added conditional layer rule "nav_num_2"? This cannot be undone.')
  })

  test('cancels removing added rule row when confirmation is declined', () => {
    confirmSpy.mockReturnValue(false)
    const { onUpdate } = renderEditor({
      conditionalLayers: [createRule(), createRule({ name: 'nav_num_2', bind: '&nav_num_2' })],
      baseKeymap: {
        layer_names: ['Base', 'Nav', 'Fn', 'Num'],
        layers: [[], [], [], []],
        sensor_layers: [],
        behavior_overrides: [],
        behavior_definitions: [],
        combos: [],
        conditional_layers: [createRule()]
      }
    })

    fireEvent.click(screen.getByLabelText(/Discard conditional rule changes nav_num_2/i))
    expect(onUpdate).not.toHaveBeenCalled()
  })

  test('restores exact base rules after editing one row then discarding it', () => {
    const baseRules = [
      createRule(),
      {
        name: 'raw_rule',
        bind: '&raw_rule',
        properties: {
          'if-layers': [0, 1],
          'then-layer': 2
        },
        property_types: {
          'if-layers': 'token-array'
        },
        children: []
      }
    ]
    const baseKeymap = {
      layer_names: ['Base', 'Nav', 'Fn', 'Num'],
      layers: [[], [], [], []],
      sensor_layers: [],
      behavior_overrides: [],
      behavior_definitions: [],
      combos: [],
      conditional_layers: baseRules
    }
    const { onUpdate, rerender } = renderEditor({
      conditionalLayers: baseRules,
      baseKeymap
    })

    fireEvent.change(screen.getByLabelText('then-layer'), { target: { value: '0' } })
    expect(onUpdate).toHaveBeenCalledTimes(1)

    const updatedKeymap = onUpdate.mock.calls[0][0]
    rerender(
      <ConditionalLayerEditor
        keymap={updatedKeymap}
        baseKeymap={baseKeymap}
        onUpdate={onUpdate}
      />
    )

    fireEvent.click(screen.getByLabelText(/Discard conditional rule changes/i))

    expect(onUpdate).toHaveBeenCalledTimes(2)
    const discardedPayload = onUpdate.mock.calls[1][0]
    expect(discardedPayload.conditional_layers).toEqual(baseKeymap.conditional_layers)
  })
})
