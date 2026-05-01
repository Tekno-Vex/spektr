import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import { RegisterPage } from './RegisterPage'

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <AuthProvider>{children}</AuthProvider>
    </MemoryRouter>
  )
}

afterEach(() => cleanup())

describe('RegisterPage', () => {
  it('renders the create account heading', () => {
    render(<RegisterPage />, { wrapper: Wrapper })
    expect(screen.getByRole('heading', { name: 'Create account' })).toBeTruthy()
  })

  it('renders email and password inputs', () => {
    render(<RegisterPage />, { wrapper: Wrapper })
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy()
    expect(screen.getByPlaceholderText('Min 8 characters')).toBeTruthy()
  })

  it('has a link to the login page', () => {
    render(<RegisterPage />, { wrapper: Wrapper })
    expect(screen.getAllByText('Sign in').length).toBeGreaterThan(0)
  })
})