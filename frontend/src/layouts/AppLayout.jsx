import React from "react";
import { Link, Outlet } from "react-router-dom";

const navStyles = {
  container: {
    display: "flex",
    gap: 16,
    alignItems: "center",
    padding: "16px 24px",
    borderBottom: "1px solid #e5e5e5",
    fontFamily: "system-ui",
    flexWrap: "wrap"
  },
  link: {
    color: "#111111",
    textDecoration: "none",
    fontWeight: 600
  }
};

export default function AppLayout() {
  return (
    <div>
      <nav style={navStyles.container}>
        <Link to="/" style={navStyles.link}>Home</Link>
        <Link to="/store" style={navStyles.link}>Store</Link>
        <Link to="/war-room" style={navStyles.link}>War Room</Link>
        <Link to="/about" style={navStyles.link}>About</Link>
        <Link to="/academy" style={navStyles.link}>Academy</Link>
        <Link to="/training" style={navStyles.link}>Training</Link>
        <Link to="/parents" style={navStyles.link}>Parents</Link>
        <Link to="/coach-portal" style={navStyles.link}>Coach Portal</Link>
        <Link to="/parent-portal" style={navStyles.link}>Parent Portal</Link>
      </nav>
      <Outlet />
    </div>
  );
}
