import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { messagingApi } from "../lib/messagingApi";

const styles = {
  container: {
    padding: 24,
    fontFamily: "system-ui"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 800
  },
  list: {
    display: "grid",
    gap: 12
  },
  card: {
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    textDecoration: "none",
    color: "#111111"
  },
  meta: {
    fontSize: 12,
    color: "#666666"
  },
  empty: {
    padding: 24,
    border: "1px dashed #d1d1d1",
    borderRadius: 12,
    color: "#666666"
  },
  error: {
    padding: 16,
    backgroundColor: "#fff5f5",
    border: "1px solid #ff3b30",
    borderRadius: 12,
    color: "#ff3b30",
    marginBottom: 16
  },
  button: {
    padding: "8px 14px",
    borderRadius: 999,
    border: "1px solid #111111",
    background: "#111111",
    color: "#ffffff",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 14
  }
};

export default function Messages() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const loadConversations = async () => {
      try {
        setLoading(true);
        const data = await messagingApi.listConversations();
        if (mounted) {
          setConversations(data.conversations || []);
        }
      } catch (err) {
        if (mounted) {
          setError(err.message || "Failed to load conversations.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    loadConversations();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Messages</h1>
        <Link to="/messages/new" style={styles.button}>
          New Direct Message
        </Link>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <p>Loading conversations...</p>
      ) : conversations.length === 0 ? (
        <div style={styles.empty}>
          No conversations yet. Start a direct message or open a team chat.
        </div>
      ) : (
        <div style={styles.list}>
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              to={`/messages/${conversation.id}`}
              style={styles.card}
            >
              <div>
                <div>{conversation.title}</div>
                <div style={styles.meta}>
                  {conversation.type === "team" ? "Team Chat" : "Direct Message"}
                </div>
              </div>
              <div style={styles.meta}>
                {conversation.lastMessage?.createdAt
                  ? new Date(conversation.lastMessage.createdAt).toLocaleString()
                  : "No messages yet"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
