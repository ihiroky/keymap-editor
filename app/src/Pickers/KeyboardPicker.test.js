import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'

jest.mock('../config', () => ({
  enableLocal: false,
  enableGitHub: true,
  enableBrowserFile: true
}))

jest.mock('./Github/Picker', () => function MockGithubPicker () {
  return <div>GitHub Picker Mock</div>
})

jest.mock('./BrowserFile/Picker', () => function MockBrowserFilePicker () {
  return <div>Browser File Picker Mock</div>
})

const KeyboardPicker = require('./KeyboardPicker').default

describe('KeyboardPicker', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  test('shows getting-started guide and keys_jp.h notice on the top page', () => {
    render(<KeyboardPicker onSelect={jest.fn()} />)

    expect(screen.getByRole('region', { name: 'getting started' })).toBeTruthy()
    expect(screen.getByText('はじめに（ZMK を使っている人へ）')).toBeTruthy()
    expect(screen.getByText(/ビルドや commit \/ push は行いません/)).toBeTruthy()
    expect(screen.getByText(/Open Config Folder/)).toBeTruthy()

    expect(screen.getByRole('note', { name: 'keys_jp.h notice' })).toBeTruthy()
    expect(screen.getByText('keys_jp.h について')).toBeTruthy()
    expect(screen.getByText(/選択したキーコードに関わらず/)).toBeTruthy()

    const note = within(screen.getByRole('note', { name: 'keys_jp.h notice' }))
    expect(note.getByText(/#include "keys_jp\.h"/)).toBeTruthy()
    expect(note.getByText('zmk-config')).toBeTruthy()
    expect(note.getByText('config')).toBeTruthy()

    const link = screen.getByRole('link', {
      name: 'https://github.com/ihiroky/zmk-config-roBa/blob/main/config/keys_jp.h'
    })
    expect(link.getAttribute('href')).toBe('https://github.com/ihiroky/zmk-config-roBa/blob/main/config/keys_jp.h')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })

  test('keeps the guide visible for browser-file initial source as well', () => {
    render(<KeyboardPicker onSelect={jest.fn()} />)

    fireEvent.change(screen.getByLabelText('Source'), {
      target: { value: '1' }
    })

    expect(screen.getByRole('region', { name: 'getting started' })).toBeTruthy()
    expect(screen.getByRole('note', { name: 'keys_jp.h notice' })).toBeTruthy()
    expect(screen.getByText('Browser File Picker Mock')).toBeTruthy()
  })

  test('hides the guide after a keymap has been loaded', () => {
    render(<KeyboardPicker onSelect={jest.fn()} hideStartGuide />)

    expect(screen.queryByRole('region', { name: 'getting started' })).toBeNull()
    expect(screen.queryByRole('note', { name: 'keys_jp.h notice' })).toBeNull()
  })
})
