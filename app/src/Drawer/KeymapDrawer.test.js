import React from 'react'
import { render, screen } from '@testing-library/react'

import KeymapDrawer from './KeymapDrawer'

const layout = [
  { x: 0, y: 0, w: 1, h: 1, label: 'A' },
  { x: 1, y: 0, w: 1, h: 1, label: 'B' },
  { x: 2, y: 0, w: 1, h: 1, label: 'C' }
]

const keymap = {
  layer_names: ['Base', 'Fn'],
  layers: [
    ['&mkp MB1', '&mt LEFT_SHIFT TAB', '&lt 1 TAB'],
    ['&trans', '&trans', '&trans']
  ],
  combos: [
    {
      name: 'combo_tab',
      properties: {
        bindings: ['&kp TAB'],
        'key-positions': [0, 1],
        layers: [0]
      }
    },
    {
      name: 'combo_broken',
      properties: {
        bindings: ['&missing_behavior'],
        'key-positions': [1, 2],
        layers: [0]
      }
    }
  ],
  behavior_overrides: [],
  behavior_definitions: []
}

const keycodes = [
  { code: 'A', symbol: 'A' },
  { code: 'TAB', symbol: 'TAB' },
  { code: 'LEFT_SHIFT', symbol: '⇧' }
]

const behaviours = [
  { code: '&mkp', name: 'Mouse Press' },
  { code: '&kp', name: 'Key Press' },
  { code: '&mt', name: 'Mod Tap' },
  { code: '&lt', name: 'Layer Tap' },
  { code: '&trans', name: 'Transparent' }
]

const behaviourTypes = [
  {
    compatible: 'zmk,behavior-hold-tap',
    overrideBinds: ['&mt', '&lt']
  }
]

describe('KeymapDrawer', () => {
  test('renders all layers, combo visuals, and layer links', () => {
    render(
      <KeymapDrawer
        layout={layout}
        keymap={keymap}
        keycodes={keycodes}
        behaviours={behaviours}
        behaviourTypes={behaviourTypes}
      />
    )

    expect(screen.getByTestId('drawer-layer-0')).toBeTruthy()
    expect(screen.getByTestId('drawer-layer-1')).toBeTruthy()

    expect(screen.getByTestId('combo-0-0')).toBeTruthy()
    expect(screen.getByTestId('combo-line-0-0-0')).toBeTruthy()

    expect(screen.getByTestId('key-behavior-0-0').textContent).toBe('mkp')
    expect(screen.getByTestId('key-behavior-0-0').getAttribute('title')).toBe('&mkp MB1')
    expect(screen.getByTestId('key-tap-0-0').textContent).toBe('MB1')
    expect(screen.getByTestId('key-tap-0-0').getAttribute('title')).toBe('&mkp MB1')
    expect(screen.getByTestId('key-tap-0-1').textContent).toBe('⇧ TAB')
    expect(screen.queryByTestId('key-hold-0-1')).toBeNull()

    const layerLink = screen.getByTestId('layer-link-0-2')
    expect(layerLink.getAttribute('href')).toBe('#drawer-layer-1')
    expect(layerLink.textContent).toBe('Fn')
    expect(layerLink.getAttribute('title')).toBe('Move to Fn (Layer 1)')
    expect(screen.getByTestId('combo-0-0').getAttribute('title')).toBe('&kp TAB')
    expect(screen.getByTestId('drawer-key-0-0').getAttribute('data-error')).toBe('false')
    expect(screen.getByTestId('drawer-key-0-1').getAttribute('data-error')).toBe('true')
    expect(screen.getByTestId('drawer-key-0-2').getAttribute('data-error')).toBe('true')
    expect(screen.getByTestId('combo-0-0').getAttribute('data-error')).toBe('false')
    expect(screen.getByTestId('combo-0-1').getAttribute('data-error')).toBe('true')
  })
})
