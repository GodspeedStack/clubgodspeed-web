import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
    border: "1px solid #e5e5e5",
    borderRadius: 12,
    height: 480,
    overflowY: "auto",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    backgroundColor: "#ffffff"
  },
  message: {
    padding: 12,
    borderRadius: 12,
    border: "1px solid #f0f0f0",
    background: "#fafafa"
  },
  meta: {
    fontSize: 12,
    color: "#666666",
    marginTop: 6
  },
  composer: {
    display: "flex",
    gap: 8,
    marginTop: 16
  },
  input: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #cccccc"
  },
  button: {
    padding: "10px 16px",
    borderRadius: 10,
    border: "1px solid #111111",
    background: "#111111",
    color: "#ffffff",
    fontWeight: 600
  },
  error: {
    padding: 12,
    borderRadius: 10,
    background: "#fff5f5",
    border: "1px solid #ff3b30",
    color: "#ff3b30",
    marginBottom: 12
  },
  loadMore: {
    border: "1px solid #e5e5e5",
    padding: 8,
    borderRadius: 8,
    background: "#f5f5f5",
    cursor: "pointer",
    textAlign: "center"
  }
};

export default function Conversation() {
  const { id } = useParams();
  const [messages, setMessages] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState("");
  const listRef = useRef(null);

  const loadMessages = useCallback(
    async (nextCursor = null, append = false) => {
      try {
        if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }
        const data = await messagingApi.listMessages(id, {
          cursor: nextCursor || undefined,
          limit: 25
        });
        setMessages((prev) => (append ? [...prev, ...data.messages] : data.messages));
        setCursor(data.nextCursor || null);
      } catch (err) {
        setError(err.message || "Failed to load messages.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [id]
  );

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list || loadingMore || !cursor) return;
    if (list.scrollTop === 0) {
      loadMessages(cursor, true);
    }
  };

  const handleSend = async () => {
    const trimmed = body.trim();
    if (!trimmed || sending) return;
    try {
      setSending(true);
      await messagingApi.sendMessage(id, trimmed);
      setBody("");
      await loadMessages();
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    } catch (err) {
      setError(err.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <Link to="/messages">Back</Link>
        <h2 style={{ margin: 0 }}>Conversation</h2>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <p>Loading messages...</p>
      ) : (
        <div
          ref={listRef}
          style={styles.list}
          onScroll={handleScroll}
          aria-label="Conversation messages"
        >
          {cursor && (
            <div style={styles.loadMore} aria-hidden={loadingMore}>
              {loadingMore ? "Loading more..." : "Scroll up to load older messages"}
            </div>
          )}
          {messages.length === 0 ? (
            <div>No messages yet.</div>
          ) : (
            messages.map((message) => (
              <div key={message.id} style={styles.message}>
                <div>{message.body}</div>
                <div style={styles.meta}>
                  {new Date(message.createdAt).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div style={styles.composer}>
        <input
          type="text"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type a message"
          style={styles.input}
          aria-label="Message body"
        />
        <button type="button" style={styles.button} onClick={handleSend} disabled={sending}>
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
