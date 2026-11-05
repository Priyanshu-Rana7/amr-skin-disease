"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const supabase = createClient();
    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { data: { display_name: String(form.get("name") ?? "") }, emailRedirectTo: `${location.origin}/dashboard` } });
    setBusy(false);
    if (result.error) { setMessage(result.error.message); return; }
    if (mode === "signup" && !result.data.session) { setMessage("Check your email to confirm the account, then sign in."); return; }
    router.replace("/dashboard"); router.refresh();
  }

  return <main className="auth-page"><form className="glass auth-card" onSubmit={submit}>
    <Link className="auth-home-link" href="/">← Back to home</Link>
    <span className="pill">SKINLAB RESEARCH WORKSPACE</span><h1>{mode === "signin" ? "Welcome back" : "Create a patient account"}</h1>
    <p>Patient and demonstration doctor accounts use this sign-in. Doctor access is assigned by the project administrator.</p>
    {mode === "signup" && <label>Display name<input name="name" autoComplete="name" required maxLength={100}/></label>}
    <label>Email<input name="email" type="email" autoComplete="email" required/></label>
    <label>Password<input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "signup" ? 6 : undefined} required/></label>
    {message && <p role="status" className="auth-message">{message}</p>}
    <button className="action mint" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
    <button className="text-link" type="button" onClick={()=>{setMode(mode === "signin" ? "signup" : "signin");setMessage("")}}>{mode === "signin" ? "New patient? Create an account" : "Already registered? Sign in"}</button>
  </form></main>;
}
