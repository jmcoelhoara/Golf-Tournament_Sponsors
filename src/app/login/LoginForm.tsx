"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setError("Email or password is incorrect.");
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <form className="signin-form" onSubmit={onSubmit}>
      <label className="stack">
        <span className="label">Email</span>
        <input className="input" type="email" autoComplete="email" required
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="stack">
        <span className="label">Password</span>
        <input className="input" type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button className="btn" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      {error && <div className="result error" role="alert">{error}</div>}
    </form>
  );
}
