import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import SaveWarningDialog from './SaveWarningDialog'

jest.mock('./Common/Modal', () => function MockModal ({ children }) {
  return <div>{children}</div>
})

describe('SaveWarningDialog', () => {
  test('shows the regeneration caution', () => {
    render(<SaveWarningDialog onConfirm={jest.fn()} onCancel={jest.fn()} />)

    expect(screen.getByRole('dialog', { name: 'save warning' })).toBeTruthy()
    expect(screen.getByText(/全体を再生成します/)).toBeTruthy()
  })

  test('reports dontShowAgain when confirmed with the checkbox checked', () => {
    const onConfirm = jest.fn()
    render(<SaveWarningDialog onConfirm={onConfirm} onCancel={jest.fn()} />)

    fireEvent.click(screen.getByLabelText('今後この確認を表示しない'))
    fireEvent.click(screen.getByRole('button', { name: '保存する' }))

    expect(onConfirm).toHaveBeenCalledWith({ dontShowAgain: true })
  })

  test('reports dontShowAgain false by default', () => {
    const onConfirm = jest.fn()
    render(<SaveWarningDialog onConfirm={onConfirm} onCancel={jest.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '保存する' }))

    expect(onConfirm).toHaveBeenCalledWith({ dontShowAgain: false })
  })

  test('calls onCancel when cancelled', () => {
    const onCancel = jest.fn()
    render(<SaveWarningDialog onConfirm={jest.fn()} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(onCancel).toHaveBeenCalled()
  })
})
