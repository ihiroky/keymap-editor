import React from 'react'
import { render, screen } from '@testing-library/react'

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

  test('shows keys_jp.h guidance with source and destination details on the top page', () => {
    render(<KeyboardPicker onSelect={jest.fn()} />)

    expect(screen.getByRole('note', { name: 'keys_jp.h notice' })).toBeTruthy()
    expect(screen.getByText('keys_jp.h について')).toBeTruthy()
    expect(screen.getByText(/#include "keys_jp\.h"/)).toBeTruthy()
    expect(screen.getByText(/このサービスでは、生成される keymap に/)).toBeTruthy()
    expect(screen.getByText(/zmk-config/)).toBeTruthy()
    expect(screen.getByText(/config/)).toBeTruthy()

    const link = screen.getByRole('link', {
      name: 'https://github.com/ihiroky/zmk-config-roBa/blob/main/config/keys_jp.h'
    })
    expect(link.getAttribute('href')).toBe('https://github.com/ihiroky/zmk-config-roBa/blob/main/config/keys_jp.h')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })

  test('keeps the notice visible for browser-file initial source as well', () => {
    window.localStorage.setItem('selectedSource', 'browser-file')

    render(<KeyboardPicker onSelect={jest.fn()} />)

    expect(screen.getByRole('note', { name: 'keys_jp.h notice' })).toBeTruthy()
    expect(screen.getByText('Browser File Picker Mock')).toBeTruthy()
  })
})
