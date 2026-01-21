import React from "react";
import { Link, useSearchParams } from "react-router-dom";

export default function Login() {
  const [params] = useSearchParams();
  const next = params.get("next") || "/";

  const handleMockLogin = () => {
    localStorage.setItem("cg_authed", "true");
    window.location.href = next;
  };

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Login</h1>
      <p>
        This is a temporary placeholder. It sets a local auth flag so we can
        wire route protection before Supabase auth is connected.
      </p>
      <button type="button" onClick={handleMockLogin}>
        Continue
      </button>
      <div style={{ marginTop: 12 }}>
        <Link to="/">Back to home</Link>
      </div>
    </div>
  );
}
