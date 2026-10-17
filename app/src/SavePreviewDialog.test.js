import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import SavePreviewDialog from './SavePreviewDialog'

jest.mock('./Common/Modal', () => function MockModal ({ children }) {
  return <div>{children}</div>
})

describe('SavePreviewDialog', () => {
  test('shows a diff summary and backup action when the original is available', () => {
    render(
      <SavePreviewDialog
        originalCode={'// comment\n&kp A'}
        generatedCode={'&kp B'}
        onBackup={jest.fn()}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    )

    expect(screen.getByRole('dialog', { name: 'save preview' })).toBeTruthy()
    expect(screen.getByText('変更: 追加 1 行 / 削除 2 行')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'バックアップをダウンロード' })).toBeTruthy()
  })

  test('shows the generated code when there is no original to diff', () => {
    render(
      <SavePreviewDialog
        generatedCode={'&kp A'}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    )

    expect(screen.queryByRole('button', { name: 'バックアップをダウンロード' })).toBeNull()
    expect(screen.getByText('&kp A')).toBeTruthy()
  })

  test('fires confirm, cancel and backup callbacks', () => {
    const onConfirm = jest.fn()
    const onCancel = jest.fn()
    const onBackup = jest.fn()

    render(
      <SavePreviewDialog
        originalCode={'&kp A'}
        generatedCode={'&kp A'}
        onBackup={onBackup}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'この内容で保存' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    fireEvent.click(screen.getByRole('button', { name: 'バックアップをダウンロード' }))

    expect(onConfirm).toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
    expect(onBackup).toHaveBeenCalled()
  })
})
