import React from "react";
import { Route, Routes } from "react-router-dom";
import AppLayout from "./layouts/AppLayout.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import LegacyPage from "./pages/LegacyPage.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Store from "./pages/Store.jsx";
import WarRoom from "./pages/WarRoom.jsx";
import Messages from "./pages/Messages.jsx";
import Conversation from "./pages/Conversation.jsx";
import NewDirectMessage from "./pages/NewDirectMessage.jsx";
import NotFound from "./pages/NotFound.jsx";

const legacyRoutes = [
  { path: "about", title: "About", file: "about.html" },
  { path: "academy", title: "Academy", file: "academy.html" },
  { path: "aau", title: "AAU", file: "aau.html" },
  { path: "contact", title: "Contact", file: "contact.html" },
  { path: "training", title: "Training", file: "training.html" },
  { path: "parents", title: "Parents", file: "parents.html" },
  { path: "coach-portal", title: "Coach Portal", file: "coach-portal.html" },
  { path: "parent-portal", title: "Parent Portal", file: "parent-portal.html" },
  { path: "security-audit", title: "Security Audit", file: "security-audit.html" },
  { path: "skill-audit", title: "Skill Audit", file: "skill-audit.html" },
  { path: "calendar", title: "Calendar", file: "calendar.html" },
  { path: "shop", title: "Shop", file: "shop.html" },
  { path: "product", title: "Product", file: "product.html" },
  { path: "verify-email", title: "Verify Email", file: "verify-email.html" },
  { path: "success", title: "Success", file: "success.html" },
  { path: "enable-2fa", title: "Enable 2FA", file: "enable-2fa.html" },
  { path: "player-profile", title: "Player Profile", file: "player-profile.html" }
];

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Home />} />
        <Route path="store" element={<Store />} />
        <Route path="login" element={<Login />} />
        <Route
          path="war-room"
          element={
            <ProtectedRoute>
              <WarRoom />
            </ProtectedRoute>
          }
        />
        <Route
          path="messages"
          element={
            <ProtectedRoute>
              <Messages />
            </ProtectedRoute>
          }
        />
        <Route
          path="messages/new"
          element={
            <ProtectedRoute>
              <NewDirectMessage />
            </ProtectedRoute>
          }
        />
        <Route
          path="messages/:id"
          element={
            <ProtectedRoute>
              <Conversation />
            </ProtectedRoute>
          }
        />
        {legacyRoutes.map((route) => (
          <Route
            key={route.path}
            path={route.path}
            element={
              route.path.endsWith("portal") ? (
                <ProtectedRoute>
                  <LegacyPage title={route.title} file={route.file} />
                </ProtectedRoute>
              ) : (
                <LegacyPage title={route.title} file={route.file} />
              )
            }
          />
        ))}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
