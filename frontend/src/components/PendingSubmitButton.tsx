"use client";

import { useFormStatus } from "react-dom";

export default function PendingSubmitButton({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();

  return <button type="submit" className={className} disabled={pending}>
    {pending && <span className="spinner" aria-hidden="true"/>}
    {pending ? pendingLabel : label}
  </button>;
}
