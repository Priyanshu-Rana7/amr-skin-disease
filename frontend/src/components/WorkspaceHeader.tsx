"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Section = "home" | "skin" | "amr" | "research" | "how" | "about" | "doctor";

const patientLinks: { href: string; label: string; section: Section }[] = [
  { href: "/dashboard", label: "Home", section: "home" },
  { href: "/skin", label: "Skin image", section: "skin" },
  { href: "/amr", label: "Antibiotic resistance", section: "amr" },
  { href: "/research", label: "Research", section: "research" },
  { href: "/how", label: "How it works", section: "how" },
  { href: "/about", label: "About", section: "about" },
];

export default function WorkspaceHeader({ patient, publicVisitor = false, active = "home" }: { patient: boolean; publicVisitor?: boolean; active?: Section }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return <header className="topbar dashboard-topbar">
    <Link className="logo" href="/dashboard" aria-label="SkinLab workspace">
      <span className="mark">S</span><span><strong>SkinLab</strong><small>RESEARCH STUDIO</small></span>
    </Link>
    <nav className="workspace-nav" aria-label="Workspace navigation">
      {publicVisitor ? <Link href="/" aria-current="page">Home</Link> : patient ? patientLinks.map(link => <Link key={link.section} href={link.href} aria-current={active === link.section ? "page" : undefined}>{link.label}</Link>) : <Link href="/dashboard" aria-current="page">Doctor workspace</Link>}
    </nav>
    {publicVisitor ? <Link className="sign-in-link" href="/login">Sign in</Link> : <button className="text-link workspace-signout" onClick={signOut} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button>}
  </header>;
}
