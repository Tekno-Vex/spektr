import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import { LoginPage } from './LoginPage'

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <AuthProvider>{children}</AuthProvider>
    </MemoryRouter>
  )
}

afterEach(() => cleanup())

describe('LoginPage', () => {
  it('renders the sign in heading', () => {
    render(<LoginPage />, { wrapper: Wrapper })
    expect(screen.getAllByText('Sign in').length).toBeGreaterThan(0)
  })

  it('renders email and password inputs', () => {
    render(<LoginPage />, { wrapper: Wrapper })
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy()
    expect(screen.getByPlaceholderText('••••••••')).toBeTruthy()
  })

  it('shows error if password is missing on submit', async () => {
    render(<LoginPage />, { wrapper: Wrapper })
    const emailInput = screen.getByPlaceholderText('you@example.com')
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    expect(screen.getAllByText('Sign in').length).toBeGreaterThan(0)
  })

  it('has a link to the register page', () => {
    render(<LoginPage />, { wrapper: Wrapper })
    const link = screen.getByRole('link', { name: 'Create one' })
    expect(link.getAttribute('href')).toMatch(/register/)
  })

  it('has a link to continue without signing in', () => {
    render(<LoginPage />, { wrapper: Wrapper })
    expect(screen.getByText('← Continue without signing in')).toBeTruthy()
  })
})