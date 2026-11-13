"use client";

import { useActionState, useState } from "react";
import { loginAction } from "../_actions/auth";
import { Field, FormError, Input, SubmitButton } from "@/components/ui/form";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, null);
  // Controlled so the email survives React's automatic form reset after a failed attempt.
  const [email, setEmail] = useState("");
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError message={state && !state.ok ? state.error : null} />
      <Field label="Email" htmlFor="email" error={fe?.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </Field>
      <Field label="Password" htmlFor="password" error={fe?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
