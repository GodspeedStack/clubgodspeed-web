import React, { useEffect } from "react";

const containerStyle = {
  padding: "24px",
  fontFamily: "system-ui"
};

const frameStyle = {
  width: "100%",
  height: "80vh",
  border: "1px solid #e5e5e5",
  borderRadius: "8px"
};

const linkStyle = {
  display: "inline-block",
  marginTop: "8px",
  color: "#111111",
  textDecoration: "none",
  fontWeight: 600
};

export default function LegacyPage({ title, file }) {
  const src = `/${file}`;

  useEffect(() => {
    if (title) {
      document.title = `${title} | Club Godspeed`;
    }
  }, [title]);

  return (
    <div style={containerStyle}>
      <h1>{title}</h1>
      <p>
        This route wraps the legacy static page so we can migrate it
        incrementally without breaking links.
      </p>
      <a href={src} style={linkStyle} target="_blank" rel="noreferrer">
        Open full page
      </a>
      <div style={{ marginTop: "16px" }}>
        <iframe title={`${title} legacy page`} src={src} style={frameStyle} />
      </div>
    </div>
  );
}
