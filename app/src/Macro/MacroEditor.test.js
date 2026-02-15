import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'

import MacroEditor from './MacroEditor'

function createBehaviorTypes () {
  const buildPropertySpecs = (compatible, bindingCells) => ({
    compatible: { type: 'string', required: true, fixed: compatible },
    '#binding-cells': { type: 'int', required: true, fixed: bindingCells },
    bindings: { type: 'bindings', required: true, minItems: 1 },
    'wait-ms': { type: 'int' },
    'tap-ms': { type: 'int' }
  })

  return [
    {
      compatible: 'zmk,behavior-macro',
      displayName: 'Macro',
      optionalProperties: ['wait-ms', 'tap-ms'],
      propertyTypes: {
        compatible: 'string',
        '#binding-cells': 'int',
        bindings: 'bindings',
        'wait-ms': 'int',
        'tap-ms': 'int'
      },
      propertySpecs: buildPropertySpecs('zmk,behavior-macro', 0)
    },
    {
      compatible: 'zmk,behavior-macro-one-param',
      displayName: 'Macro (1 Param)',
      optionalProperties: ['wait-ms', 'tap-ms'],
      propertyTypes: {
        compatible: 'string',
        '#binding-cells': 'int',
        bindings: 'bindings',
        'wait-ms': 'int',
        'tap-ms': 'int'
      },
      propertySpecs: buildPropertySpecs('zmk,behavior-macro-one-param', 1)
    },
    {
      compatible: 'zmk,behavior-macro-two-param',
      displayName: 'Macro (2 Param)',
      optionalProperties: ['wait-ms', 'tap-ms'],
      propertyTypes: {
        compatible: 'string',
        '#binding-cells': 'int',
        bindings: 'bindings',
        'wait-ms': 'int',
        'tap-ms': 'int'
      },
      propertySpecs: buildPropertySpecs('zmk,behavior-macro-two-param', 2)
    }
  ]
}

function createMacroDefinition (overrides = {}) {
  return {
    label: 'macro_test',
    name: 'macro_test_node',
    bind: '&macro_test',
    compatible: 'zmk,behavior-macro-two-param',
    properties: {
      compatible: 'zmk,behavior-macro-two-param',
      '#binding-cells': 2,
      bindings: ['&kp A', '&kp B']
    },
    property_types: {
      compatible: 'string',
      '#binding-cells': 'int',
      bindings: 'bindings'
    },
    property_order: ['compatible', '#binding-cells', 'bindings'],
    children: [],
    ...overrides
  }
}

function renderEditor (options = {}) {
  const onUpdate = options.onUpdate || jest.fn()
  const keymap = {
    layers: [],
    sensor_layers: [],
    behavior_overrides: [],
    behavior_definitions: options.definitions || [createMacroDefinition()]
  }
  const baseKeymap = options.baseKeymap || keymap

  const view = render(
    <MacroEditor
      keymap={keymap}
      baseKeymap={baseKeymap}
      behaviorTypes={options.behaviorTypes || createBehaviorTypes()}
      availableBehaviours={options.availableBehaviours || [
        { code: '&none', name: 'None' },
        { code: '&kp', name: 'Key Press' }
      ]}
      onUpdate={onUpdate}
    />
  )

  return { onUpdate, ...view }
}

describe('MacroEditor', () => {
  let confirmSpy

  beforeEach(() => {
    confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    confirmSpy.mockRestore()
  })

  test('adds and deletes macro definitions', () => {
    const { onUpdate } = renderEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Add Macro' }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].behavior_definitions).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Selected' }))
    expect(onUpdate).toHaveBeenCalledTimes(2)
    expect(confirmSpy).toHaveBeenCalledWith('Delete macro "macro_test"? This cannot be undone.')
  })

  test('cancels deleting selected macro when confirmation is declined', () => {
    confirmSpy.mockReturnValue(false)
    const { onUpdate } = renderEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Add Macro' }))
    expect(onUpdate).toHaveBeenCalledTimes(1)
    onUpdate.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Selected' }))
    expect(onUpdate).not.toHaveBeenCalled()
  })

  test('applies raw bindings and blocks invalid updates', () => {
    const { onUpdate } = renderEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Raw' }))

    const textarea = screen.getByLabelText('Macro Raw Bindings')
    fireEvent.change(textarea, { target: { value: '&macro_tap\n&kp B' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply Raw' }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].behavior_definitions[0].properties.bindings).toEqual(['&macro_tap', '&kp B'])

    onUpdate.mockClear()
    fireEvent.change(textarea, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply Raw' }))

    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText(/bindings must include at least one binding/i)).toBeTruthy()
  })

  test('reorders steps with native drag and drop', () => {
    const { onUpdate } = renderEditor({
      definitions: [createMacroDefinition({
        properties: {
          compatible: 'zmk,behavior-macro-two-param',
          '#binding-cells': 2,
          bindings: ['&kp A', '&kp B', '&kp C']
        }
      })]
    })

    const draggableRows = Array.from(document.querySelectorAll('[draggable="true"]'))
    fireEvent.dragStart(draggableRows[0])
    fireEvent.dragOver(draggableRows[2])
    fireEvent.drop(draggableRows[2])

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].behavior_definitions[0].properties.bindings).toEqual(['&kp B', '&kp C', '&kp A'])
  })

  test('blocks incompatible parameter forwarding', () => {
    const { onUpdate } = renderEditor({
      definitions: [createMacroDefinition({
        properties: {
          compatible: 'zmk,behavior-macro-two-param',
          '#binding-cells': 2,
          bindings: ['&macro_param_2to1']
        }
      })]
    })

    fireEvent.change(screen.getByLabelText('Compatible'), {
      target: { value: 'zmk,behavior-macro-one-param' }
    })

    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByText(/requires macro binding-cells >= 2/i)).toBeTruthy()
  })

  test('shows error when macro type definitions are missing', () => {
    renderEditor({
      behaviorTypes: [
        {
          compatible: 'zmk,behavior-macro',
          displayName: 'Macro'
        }
      ]
    })

    expect(screen.getByText(/Missing macro type definitions/i)).toBeTruthy()
  })

  test('shows and updates label property value', () => {
    const { onUpdate } = renderEditor({
      definitions: [createMacroDefinition({
        properties: {
          compatible: 'zmk,behavior-macro-two-param',
          '#binding-cells': 2,
          bindings: ['&kp A'],
          label: 'TO_LAYER_0'
        },
        property_types: {
          compatible: 'string',
          '#binding-cells': 'int',
          bindings: 'bindings',
          label: 'string'
        },
        property_order: ['compatible', '#binding-cells', 'bindings', 'label']
      })]
    })

    const input = screen.getByLabelText('Property Label')
    expect(input.value).toBe('TO_LAYER_0')

    fireEvent.change(input, { target: { value: 'TO_LAYER_EDITED' } })
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].behavior_definitions[0].properties.label).toBe('TO_LAYER_EDITED')
  })

  test('adds optional known property from add known properties', () => {
    const { onUpdate } = renderEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Add wait-ms' }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].behavior_definitions[0].properties['wait-ms']).toBe(0)
  })

  test('removes optional known property after it is added', () => {
    const { onUpdate } = renderEditor({
      definitions: [createMacroDefinition({
        properties: {
          compatible: 'zmk,behavior-macro-two-param',
          '#binding-cells': 2,
          bindings: ['&kp A'],
          'tap-ms': 40
        },
        property_types: {
          compatible: 'string',
          '#binding-cells': 'int',
          bindings: 'bindings',
          'tap-ms': 'int'
        },
        property_order: ['compatible', '#binding-cells', 'bindings', 'tap-ms']
      })]
    })

    const row = screen.getByText('tap-ms').closest('div')
    fireEvent.click(within(row).getByRole('button', { name: 'Remove' }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].behavior_definitions[0].properties['tap-ms']).toBeUndefined()
  })

  test('shows section headings for required and optional properties', () => {
    renderEditor()

    expect(screen.getByText('Required Properties')).toBeTruthy()
    expect(screen.getByText('Optional Properties')).toBeTruthy()
    expect(screen.getByText('Add Known Properties')).toBeTruthy()
  })

  test('marks changed step rows against base definitions', () => {
    renderEditor({
      definitions: [createMacroDefinition({
        properties: {
          compatible: 'zmk,behavior-macro-two-param',
          '#binding-cells': 2,
          bindings: ['&kp C', '&kp B']
        }
      })],
      baseKeymap: {
        layers: [],
        sensor_layers: [],
        behavior_overrides: [],
        behavior_definitions: [createMacroDefinition()]
      }
    })

    const changedStep = document.querySelector('[data-changed="true"][draggable="true"]')
    expect(changedStep).toBeTruthy()
  })

  test('shows Added badge when macro is newly added in current state', () => {
    renderEditor({
      definitions: [createMacroDefinition(), createMacroDefinition({ label: 'macro_2', name: 'macro_2_node', bind: '&macro_2' })],
      baseKeymap: {
        layers: [],
        sensor_layers: [],
        behavior_overrides: [],
        behavior_definitions: [createMacroDefinition()]
      }
    })

    expect(screen.getByText('Added')).toBeTruthy()
    expect(screen.getByText(/\+1 \/ Deleted 0/i)).toBeTruthy()
  })

  test('discards changed macro row back to base value', () => {
    const { onUpdate } = renderEditor({
      definitions: [createMacroDefinition({ label: 'macro_changed', name: 'macro_changed_node', bind: '&macro_changed' })],
      baseKeymap: {
        layers: [],
        sensor_layers: [],
        behavior_overrides: [],
        behavior_definitions: [createMacroDefinition()]
      }
    })

    fireEvent.click(screen.getByLabelText(/Discard macro changes/i))
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].behavior_definitions[0].label).toBe('macro_test')
  })

  test('discards added macro row by removing it', () => {
    const { onUpdate } = renderEditor({
      definitions: [createMacroDefinition(), createMacroDefinition({ label: 'macro_2', name: 'macro_2_node', bind: '&macro_2' })],
      baseKeymap: {
        layers: [],
        sensor_layers: [],
        behavior_overrides: [],
        behavior_definitions: [createMacroDefinition()]
      }
    })

    fireEvent.click(screen.getByLabelText(/Discard macro changes macro_2/i))
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0][0].behavior_definitions).toHaveLength(1)
    expect(confirmSpy).toHaveBeenCalledWith('Remove added macro "macro_2"? This cannot be undone.')
  })

  test('cancels removing added macro row when confirmation is declined', () => {
    confirmSpy.mockReturnValue(false)
    const { onUpdate } = renderEditor({
      definitions: [createMacroDefinition(), createMacroDefinition({ label: 'macro_2', name: 'macro_2_node', bind: '&macro_2' })],
      baseKeymap: {
        layers: [],
        sensor_layers: [],
        behavior_overrides: [],
        behavior_definitions: [createMacroDefinition()]
      }
    })

    fireEvent.click(screen.getByLabelText(/Discard macro changes macro_2/i))
    expect(onUpdate).not.toHaveBeenCalled()
  })

  test('restores exact base macro definitions after editing one row then discarding it', () => {
    const baseDefinitions = [
      createMacroDefinition(),
      createMacroDefinition({
        label: 'macro_raw',
        name: 'macro_raw_node',
        bind: '&macro_raw',
        property_types: {
          compatible: 'string'
        },
        property_order: ['compatible']
      })
    ]
    const baseKeymap = {
      layers: [],
      sensor_layers: [],
      behavior_overrides: [],
      behavior_definitions: baseDefinitions
    }
    const behaviorTypes = createBehaviorTypes()
    const availableBehaviours = [
      { code: '&none', name: 'None' },
      { code: '&kp', name: 'Key Press' }
    ]
    const { onUpdate, rerender } = renderEditor({
      definitions: baseDefinitions,
      baseKeymap,
      behaviorTypes,
      availableBehaviours
    })

    fireEvent.change(screen.getByDisplayValue('macro_test'), { target: { value: 'macro_changed' } })
    expect(onUpdate).toHaveBeenCalledTimes(1)

    const updatedKeymap = onUpdate.mock.calls[0][0]
    rerender(
      <MacroEditor
        keymap={updatedKeymap}
        baseKeymap={baseKeymap}
        behaviorTypes={behaviorTypes}
        availableBehaviours={availableBehaviours}
        onUpdate={onUpdate}
      />
    )

    fireEvent.click(screen.getByLabelText(/Discard macro changes/i))

    expect(onUpdate).toHaveBeenCalledTimes(2)
    const discardedPayload = onUpdate.mock.calls[1][0]
    expect(discardedPayload.behavior_definitions).toEqual(baseKeymap.behavior_definitions)
  })
})
