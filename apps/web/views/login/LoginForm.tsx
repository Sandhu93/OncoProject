'use client';

import { useActionState } from 'react';

import { login, type LoginState } from '@/app/login/actions';

interface LoginFormProps {
  /** The encoded page to return to after login, passed through from `?redirect=`. */
  redirect?: string;
}

interface FieldProps {
  name: 'username' | 'password';
  label: string;
  type: string;
  autoComplete: string;
  defaultValue?: string;
  errors?: string[];
}

/** A labelled input with its error linked by aria-describedby, so screen readers read it with the field. */
function Field({ name, label, type, autoComplete, defaultValue, errors }: FieldProps) {
  const errorId = `${name}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        defaultValue={defaultValue}
        aria-invalid={errors ? true : undefined}
        aria-describedby={errors ? errorId : undefined}
        className="min-h-11 rounded-[10px] border border-line bg-surface px-3 py-2 text-base aria-invalid:border-red-600"
      />
      {errors && (
        <p id={errorId} className="text-sm text-red-600">
          {errors[0]}
        </p>
      )}
    </div>
  );
}

export default function LoginForm({ redirect }: LoginFormProps) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <h1 className="text-2xl font-semibold">Log in to OncoTrack</h1>

      {state.message && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}

      <Field
        name="username"
        label="Username"
        type="text"
        autoComplete="username"
        defaultValue={state.username}
        errors={state.fieldErrors?.username}
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        errors={state.fieldErrors?.password}
      />

      {redirect && <input type="hidden" name="redirect" value={redirect} />}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-foreground px-5 py-2 font-medium text-background transition-opacity disabled:opacity-60"
      >
        {pending ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}
