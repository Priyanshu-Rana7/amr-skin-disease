"use client";

import { useEffect, useState } from "react";

export default function AdminToast({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 5000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return <div className="admin-toast" role="status" aria-live="polite">
    <span className="admin-toast-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m5 12.5 4.3 4.2L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
    <span>{message}</span>
    <button type="button" onClick={() => setVisible(false)} aria-label="Dismiss confirmation">×</button>
  </div>;
}
