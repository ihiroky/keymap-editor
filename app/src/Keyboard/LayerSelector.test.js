import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import LayerSelector from './LayerSelector'

function renderSelector(overrides = {}) {
  const props = {
    layers: ['Base', 'Nav'],
    activeLayer: 0,
    onSelect: jest.fn(),
    onNewLayer: jest.fn(),
    onRenameLayer: jest.fn(),
    onDeleteLayer: jest.fn(),
    onDuplicateLayer: jest.fn(),
    onMoveLayer: jest.fn(),
    ...overrides
  }

  render(<LayerSelector {...props} />)
  return props
}

describe('LayerSelector', () => {
  test('duplicates the clicked layer', () => {
    const props = renderSelector()

    fireEvent.click(screen.getByTitle('Duplicate layer Base'))

    expect(props.onDuplicateLayer).toHaveBeenCalledTimes(1)
    expect(props.onDuplicateLayer).toHaveBeenCalledWith(0)
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  test('shows a tooltip for delete action', () => {
    renderSelector()

    expect(screen.getByTitle('Delete layer Base')).toBeTruthy()
  })

  test('moves layer by drag and drop', () => {
    const props = renderSelector()
    const source = screen.getByText('Base').closest('li')
    const target = screen.getByText('Nav').closest('li')
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: jest.fn()
    }

    fireEvent.dragStart(source, { dataTransfer })
    fireEvent.dragOver(target, { dataTransfer })
    fireEvent.drop(target, { dataTransfer })

    expect(props.onMoveLayer).toHaveBeenCalledTimes(1)
    expect(props.onMoveLayer).toHaveBeenCalledWith(0, 1)
  })

  test('shows changed marker when changedLayers is true', () => {
    renderSelector({ changedLayers: [true, false] })

    const changedRow = screen.getByText('Base').closest('li')
    expect(changedRow.getAttribute('data-changed')).toBe('true')
  })
})
