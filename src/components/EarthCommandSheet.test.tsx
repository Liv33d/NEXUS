import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EarthCommandSheet } from './EarthCommandSheet'

afterEach(cleanup)

describe('EarthCommandSheet', () => {
  it('traps focus, closes with Escape, and returns focus to its trigger', () => {
    const onClose = vi.fn()
    const trigger = document.createElement('button')
    trigger.textContent = 'Open controls'
    document.body.append(trigger)
    trigger.focus()

    const { unmount } = render(<EarthCommandSheet activePanel="layers" onPanelChange={() => undefined} onClose={onClose}>
      <button>Last action</button>
    </EarthCommandSheet>)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'Close controls' })).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Last action' })).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()

    unmount()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })

  it('only dismisses when the backdrop itself is pressed', () => {
    const onClose = vi.fn()
    render(<EarthCommandSheet activePanel="search" onPanelChange={() => undefined} onClose={onClose}><button>Action</button></EarthCommandSheet>)
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not include controls inside closed details in the focus loop', () => {
    render(<EarthCommandSheet activePanel="layers" onPanelChange={() => undefined} onClose={() => undefined}>
      <button>Visible action</button>
      <details><summary>Advanced</summary><button>Hidden action</button></details>
    </EarthCommandSheet>)
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(screen.getByText('Advanced')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Hidden action', hidden: true })).not.toHaveFocus()
  })
})
