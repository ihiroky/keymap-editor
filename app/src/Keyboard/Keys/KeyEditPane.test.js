import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import KeyEditPane from './KeyEditPane'
import { SearchContext } from '../../providers'

function renderPane (options = {}) {
  const selectedKey = options.selectedKey || {
    index: 0,
    label: 'A',
    binding: {
      value: '&to',
      params: [{ value: '0', params: [] }]
    }
  }

  const sources = {
    behaviours: {
      '&to': {
        code: '&to',
        name: 'To Layer',
        params: ['layer']
      },
      '&kp': {
        code: '&kp',
        name: 'Key Press',
        params: ['code']
      }
    },
    layer: {
      0: { code: '0', description: 'Base' },
      1: { code: '1', description: 'Nav' }
    },
    code: {}
  }

  render(
    <SearchContext.Provider
      value={{
        sources,
        getSearchTargets: () => []
      }}
    >
      <KeyEditPane
        selectedKey={selectedKey}
        baselineBinding={options.baselineBinding}
        onApply={options.onApply || jest.fn()}
        onClose={options.onClose || jest.fn()}
        canDiscardChange={options.canDiscardChange}
        onDiscardChange={options.onDiscardChange}
        discardLabel={options.discardLabel}
      />
    </SearchContext.Provider>
  )
}

describe('KeyEditPane change markers', () => {
  test('marks changed parameter rows against baseline binding', () => {
    renderPane({
      baselineBinding: {
        value: '&to',
        params: [{ value: '1', params: [] }]
      }
    })

    const paramRow = screen.getByText('Layer').closest('[data-depth]')
    expect(paramRow).toBeTruthy()
    expect(paramRow.getAttribute('data-changed')).toBe('true')
  })

  test('marks behavior row when behavior code changes against baseline', () => {
    renderPane({
      selectedKey: {
        index: 0,
        label: 'A',
        binding: {
          value: '&kp',
          params: [{ value: 'A', params: [] }]
        }
      },
      baselineBinding: {
        value: '&to',
        params: [{ value: '0', params: [] }]
      }
    })

    const behaviorRow = screen.getByText('Value').closest('[data-changed]')
    expect(behaviorRow).toBeTruthy()
    expect(behaviorRow.getAttribute('data-changed')).toBe('true')
  })

  test('shows discard button and fires callback when discard is available', () => {
    const onDiscardChange = jest.fn()
    renderPane({
      baselineBinding: {
        value: '&to',
        params: [{ value: '1', params: [] }]
      },
      canDiscardChange: true,
      onDiscardChange
    })

    const discardButton = screen.getByRole('button', { name: /Discard changes for A/i })
    expect(discardButton.getAttribute('title')).toBe('Discard changes for A')
    fireEvent.click(discardButton)
    expect(onDiscardChange).toHaveBeenCalledTimes(1)
  })
})
