import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { messagingApi } from "../lib/messagingApi";

const styles = {
  container: {
    padding: 24,
    fontFamily: "system-ui"
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 16
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
    cursor: "pointer"
  },
  meta: {
    fontSize: 12,
    color: "#666666"
  },
  error: {
    padding: 12,
    borderRadius: 10,
    background: "#fff5f5",
    border: "1px solid #ff3b30",
    color: "#ff3b30",
    marginBottom: 12
  }
};

export default function NewDirectMessage() {
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const loadRecipients = async () => {
      try {
        const data = await messagingApi.listEligibleRecipients();
        if (mounted) {
          setRecipients(data.recipients || []);
        }
      } catch (err) {
        if (mounted) {
          setError(err.message || "Failed to load recipients.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadRecipients();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSelect = async (recipientId) => {
    try {
      const data = await messagingApi.createDirectConversation(recipientId);
      navigate(`/messages/${data.conversation.id}`);
    } catch (err) {
      setError(err.message || "Unable to start conversation.");
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Link to="/messages">Back</Link>
        <h2 style={{ margin: 0 }}>New Direct Message</h2>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <p>Loading recipients...</p>
      ) : recipients.length === 0 ? (
        <p>No eligible recipients available.</p>
      ) : (
        <div style={styles.list}>
          {recipients.map((recipient) => (
            <button
              key={recipient.id}
              type="button"
              style={styles.card}
              onClick={() => handleSelect(recipient.id)}
            >
              <div>
                <div>{recipient.displayName}</div>
                <div style={styles.meta}>{recipient.role}</div>
              </div>
              <div style={styles.meta}>Start</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
