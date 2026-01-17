import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Page not found</h1>
      <p>The route you requested doesn’t exist yet.</p>
      <Link to="/" style={{ fontWeight: 600, color: "#111111" }}>
        Return to home
      </Link>
    </div>
  );
}
