'use client'

import { useActionState } from 'react'
import { loginAction, type LoginState } from '../actions'

export function LoginForm({ next, disabled }: { next: string; disabled: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {})
  return (
    <form action={action} className="adm-login__form">
      <input type="hidden" name="next" value={next} />
      <div className="adm-field">
        <label className="adm-label" htmlFor="username">
          Usuário
        </label>
        <input id="username" name="username" autoComplete="username" required disabled={disabled} defaultValue={state.username ?? ''} key={state.username ?? ''} />
      </div>
      <div className="adm-field">
        <label className="adm-label" htmlFor="password">
          Senha
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required disabled={disabled} />
      </div>
      {state.error ? (
        <p className="adm-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" className="adm-btn adm-btn--primary" disabled={pending || disabled}>
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}
