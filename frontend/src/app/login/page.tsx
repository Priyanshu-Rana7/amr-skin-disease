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
    try {
      const form = new FormData(event.currentTarget);
      const email = String(form.get("email") ?? "");
      const password = String(form.get("password") ?? "");
      const supabase = createClient();
      const result = mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { display_name: String(form.get("name") ?? "") }, emailRedirectTo: `${location.origin}/dashboard` } });
      if (result.error) { setMessage(result.error.message); return; }
      if (mode === "signup" && !result.data.session) { setMessage("Check your email to confirm the account, then sign in."); return; }
      if (mode === "signin") {
        const signedInUser = result.data.user;
        if (!signedInUser) { setMessage("Sign-in did not return an account. Please try again."); return; }
        const { data: profile, error: profileError } = await supabase.from("profiles").select("role,is_active").eq("id", signedInUser.id).maybeSingle();
        if (profileError || !profile?.is_active) {
          await supabase.auth.signOut();
          setMessage("This account is inactive or not fully set up. Contact the project administrator.");
          return;
        }
        router.replace(profile.role === "admin" ? "/dashboard/admin" : "/dashboard");
        router.refresh();
        return;
      }
      router.replace("/dashboard"); router.refresh();
    } catch {
      setMessage("We could not reach the sign-in service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page"><form className="glass auth-card" onSubmit={submit}>
    <Link className="auth-home-link" href="/">← Back to home</Link>
    <span className="pill">SKINLAB RESEARCH WORKSPACE</span><h1>{mode === "signin" ? "Welcome back" : "Create a patient account"}</h1>
    <p>Sign in with your project account. Patient self-registration is available; doctor and administrator access is assigned through project administration.</p>
    {mode === "signup" && <label>Display name<input name="name" autoComplete="name" required maxLength={100}/></label>}
    <label>Email<input name="email" type="email" autoComplete="email" required/></label>
    <label>Password<input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={mode === "signup" ? 6 : undefined} required/></label>
    {message && <p role="status" className="auth-message">{message}</p>}
    <button className="action mint" disabled={busy}>{busy ? <><span className="spinner" aria-hidden="true"/>Please wait…</> : mode === "signin" ? "Sign in" : "Create account"}</button>
    <button className="text-link" type="button" onClick={()=>{setMode(mode === "signin" ? "signup" : "signin");setMessage("")}}>{mode === "signin" ? "New patient? Create an account" : "Already registered? Sign in"}</button>
  </form></main>;
}
