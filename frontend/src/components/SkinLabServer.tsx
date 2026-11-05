import SkinLabClient, { type View } from "@/components/SkinLabClient";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export default async function SkinLabServer({ view }: { view: View }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (view === "home" && user) redirect("/dashboard");
  if (view !== "home") {
    if (!user) redirect("/login");
    const { data: profile } = await supabase.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
    if (!profile?.is_active || profile.role !== "patient") redirect("/dashboard");
  }

  return <SkinLabClient view={view} signedIn={Boolean(user)} />;
}
