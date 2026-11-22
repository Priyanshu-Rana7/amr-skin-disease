"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Section = "home" | "skin" | "amr" | "research" | "how" | "about" | "doctor" | "admin";

const patientLinks: { href: string; label: string; section: Section }[] = [
  { href: "/dashboard", label: "Home", section: "home" },
  { href: "/skin", label: "Skin image", section: "skin" },
  { href: "/amr", label: "Antibiotic resistance", section: "amr" },
  { href: "/research", label: "Research", section: "research" },
  { href: "/how", label: "How it works", section: "how" },
  { href: "/about", label: "About", section: "about" },
];
const publicLinks: { href: string; label: string; section: Section }[] = [
  { href: "/", label: "Home", section: "home" },
  { href: "/research", label: "Research", section: "research" },
  { href: "/how", label: "How it works", section: "how" },
  { href: "/about", label: "About", section: "about" },
];

export default function WorkspaceHeader({ patient, admin = false, publicVisitor = false, active = "home" }: { patient: boolean; admin?: boolean; publicVisitor?: boolean; active?: Section }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  async function signOut() {
    setBusy(true);
    setSignOutError("");
    try {
      const { error } = await createClient().auth.signOut();
      if (error) {
        setSignOutError("Could not sign out. Check your connection and try again.");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setSignOutError("Could not sign out. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <header className="topbar dashboard-topbar">
    <Link className="logo" href={publicVisitor ? "/" : "/dashboard"}>
      <span className="mark" aria-hidden="true">S</span><span><strong>SkinLab</strong><small>RESEARCH STUDIO</small></span>
    </Link>
    <nav className="workspace-nav" aria-label="Workspace navigation">
      {publicVisitor ? publicLinks.map(link => <Link key={link.section} href={link.href} aria-current={active === link.section ? "page" : undefined}>{link.label}</Link>) : patient ? patientLinks.map(link => <Link key={link.section} href={link.href} aria-current={active === link.section ? "page" : undefined}>{link.label}</Link>) : admin ? <Link href="/dashboard/admin" aria-current="page">Admin panel</Link> : <Link href="/dashboard" aria-current="page">Doctor workspace</Link>}
    </nav>
    {publicVisitor ? <Link className="sign-in-link" href="/login">Sign in</Link> : <span className="workspace-session-actions">{signOutError && <span role="status" className="workspace-signout-error">{signOutError}</span>}<button className="text-link workspace-signout" onClick={signOut} disabled={busy}>{busy ? <><span className="spinner" aria-hidden="true"/>Signing out…</> : "Sign out"}</button></span>}
  </header>;
}
