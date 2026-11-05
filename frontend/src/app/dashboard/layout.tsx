import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import WorkspaceHeader from "@/components/WorkspaceHeader";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
  if (!profile?.is_active) redirect("/login");
  const patient = profile.role === "patient";
  return (
    <div className="app dark dashboard-shell">
      <WorkspaceHeader patient={patient} active={patient ? "home" : "doctor"} />
      {children}
    </div>
  );
}
