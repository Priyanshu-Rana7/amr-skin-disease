"use client";

import type { FormEvent } from "react";
import PendingSubmitButton from "@/components/PendingSubmitButton";

type ProfileAction = (formData: FormData) => void | Promise<void>;

export default function AdminProfileForm({
  action,
  userId,
  displayName,
  role,
  isActive,
}: {
  action: ProfileAction;
  userId: string;
  displayName: string | null;
  role: "patient" | "doctor";
  isActive: boolean;
}) {
  function confirmAccessChange(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    const nextRole = String(form.get("role") ?? "");
    const nextActive = form.get("is_active") === "on";
    if (nextRole === role && nextActive === isActive) return;

    const consequences = [
      nextRole !== role ? `change this account from ${role} to ${nextRole}` : "",
      nextActive !== isActive ? (nextActive ? "reactivate this account" : "deactivate this account") : "",
    ].filter(Boolean).join(" and ");

    if (!window.confirm(`Are you sure you want to ${consequences}? The account's workspace access will change immediately.`)) {
      event.preventDefault();
    }
  }

  return <form action={action} onSubmit={confirmAccessChange} className="admin-account-form">
    <input type="hidden" name="user_id" value={userId}/>
    <label>Display name<input name="display_name" defaultValue={displayName ?? ""} maxLength={100} required/></label>
    <label>Workspace access<select name="role" defaultValue={role}><option value="patient">Patient</option><option value="doctor">Doctor</option></select></label>
    <label className="admin-account-active"><input type="checkbox" name="is_active" defaultChecked={isActive}/> Account is active</label>
    <PendingSubmitButton className="action mint" label="Save account changes" pendingLabel="Saving account…"/>
  </form>;
}
