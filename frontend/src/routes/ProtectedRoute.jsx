import React from "react";
import { Navigate, useLocation } from "react-router-dom";

// Temporary auth check (placeholder).
// Replace this later with Supabase session + role checks.
function isAuthed() {
  return localStorage.getItem("cg_authed") === "true";
}

export default function ProtectedRoute({ children }) {
  const location = useLocation();

  if (!isAuthed()) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return children;
}
