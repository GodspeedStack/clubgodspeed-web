import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * ParentInbox
 * 
 * Displays messages sent to parents with automatic read tracking.
 * Features:
 * - Auto-mark as read when message is rendered
 * - Visual distinction between read/unread messages
 * - Reply functionality (1-on-1 with coach only)
 * - Real-time updates via Supabase subscriptions
 */
export default function ParentInbox({ parentId }) {
    const [messages, setMessages] = useState([]);
    const [selectedMessage, setSelectedMessage] = useState(null);
    const [replyText, setReplyText] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [sending, setSending] = useState(false);

    // Track which messages have been marked as read
    const markedAsRead = useRef(new Set());

    useEffect(() => {
        loadMessages();

        // Subscribe to real-time updates
        const subscription = supabase
            .channel('parent_messages')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'message_recipients',
                filter: `user_id=eq.${parentId}`
            }, handleNewMessage)
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [parentId]);

    /**
     * Load all messages for this parent
     */
    const loadMessages = async () => {
        try {
            setLoading(true);

            const { data, error } = await supabase
                .from('message_recipients')
                .select(`
                    id,
                    status,
                    read_at,
                    sent_at,
                    messages (
                        id,
                        subject,
                        body,
                        sent_at,
                        sender_id,
                        profiles:sender_id (
                            full_name,
                            email
                        )
                    )
                `)
                .eq('user_id', parentId)
                .order('sent_at', { ascending: false });

            if (error) throw error;

            setMessages(data || []);
        } catch (err) {
            console.error('Error loading messages:', err);
            setError('Failed to load messages');
        } finally {
            setLoading(false);
        }
    };

    /**
     * Handle new message via real-time subscription
     */
    const handleNewMessage = (payload) => {
        loadMessages(); // Reload all messages
    };

    /**
     * Mark message as read when it's viewed
     */
    const markAsRead = async (recipientId, messageId) => {
        // Skip if already marked
        if (markedAsRead.current.has(recipientId)) {
            return;
        }

        try {
            const { error } = await supabase
                .from('message_recipients')
                .update({
                    status: 'read',
                    read_at: new Date().toISOString()
                })
                .eq('id', recipientId);

            if (error) throw error;

            // Track that we've marked this message
            markedAsRead.current.add(recipientId);

            // Update local state
            setMessages(prev => prev.map(msg =>
                msg.id === recipientId
                    ? { ...msg, status: 'read', read_at: new Date().toISOString() }
                    : msg
            ));
        } catch (err) {
            console.error('Error marking message as read:', err);
        }
    };

    /**
     * Open message and mark as read
     */
    const handleMessageClick = (message) => {
        setSelectedMessage(message);
        setReplyText('');

        // Auto-mark as read
        if (message.status !== 'read') {
            markAsRead(message.id, message.messages.id);
        }
    };

    /**
     * Send reply to coach (1-on-1 only, no "Reply All")
     */
    const handleSendReply = async (e) => {
        e.preventDefault();

        if (!replyText.trim()) {
            return;
        }

        setSending(true);

        try {
            const { error } = await supabase
                .from('message_replies')
                .insert({
                    parent_message_id: selectedMessage.messages.id,
                    sender_id: parentId,
                    recipient_id: selectedMessage.messages.sender_id,
                    body: replyText.trim()
                });

            if (error) throw error;

            // Clear reply text
            setReplyText('');

            // Show success (you could add a toast notification here)
            alert('Reply sent successfully!');
        } catch (err) {
            console.error('Error sending reply:', err);
            alert('Failed to send reply. Please try again.');
        } finally {
            setSending(false);
        }
    };

    if (loading) {
        return (
            <div style={styles.loading}>
                <div style={styles.spinner}></div>
                <p>Loading messages...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div style={styles.error}>
                <p>⚠️ {error}</p>
                <button onClick={loadMessages} style={styles.retryButton}>
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h2 style={styles.title}>Inbox</h2>
                <p style={styles.subtitle}>
                    {messages.filter(m => m.status !== 'read').length} unread messages
                </p>
            </div>

            <div style={styles.layout}>
                {/* Message List */}
                <div style={styles.messageList}>
                    {messages.length === 0 ? (
                        <div style={styles.emptyState}>
                            <p>No messages yet</p>
                        </div>
                    ) : (
                        messages.map(message => (
                            <div
                                key={message.id}
                                onClick={() => handleMessageClick(message)}
                                style={{
                                    ...styles.messageItem,
                                    ...(selectedMessage?.id === message.id ? styles.messageItemActive : {}),
                                    ...(message.status !== 'read' ? styles.messageItemUnread : {})
                                }}
                            >
                                <div style={styles.messageHeader}>
                                    <span style={{
                                        ...styles.messageSubject,
                                        ...(message.status !== 'read' ? styles.messageSubjectUnread : {})
                                    }}>
                                        {message.messages.subject}
                                    </span>
                                    {message.status !== 'read' && (
                                        <span style={styles.unreadBadge}>●</span>
                                    )}
                                </div>
                                <div style={styles.messageMeta}>
                                    <span style={styles.messageSender}>
                                        From: {message.messages.profiles?.full_name || 'Coach'}
                                    </span>
                                    <span style={styles.messageDate}>
                                        {new Date(message.sent_at).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Message Detail */}
                {selectedMessage && (
                    <div style={styles.messageDetail}>
                        <div style={styles.detailHeader}>
                            <h3 style={styles.detailSubject}>
                                {selectedMessage.messages.subject}
                            </h3>
                            <div style={styles.detailMeta}>
                                <span>From: {selectedMessage.messages.profiles?.full_name || 'Coach'}</span>
                                <span>{new Date(selectedMessage.sent_at).toLocaleString()}</span>
                            </div>
                        </div>

                        <div style={styles.detailBody}>
                            {selectedMessage.messages.body.split('\n').map((line, i) => (
                                <p key={i} style={styles.bodyParagraph}>{line}</p>
                            ))}
                        </div>

                        {/* Reply Form */}
                        <div style={styles.replySection}>
                            <h4 style={styles.replyTitle}>Reply to Coach</h4>
                            <form onSubmit={handleSendReply}>
                                <textarea
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    placeholder="Type your reply..."
                                    style={styles.replyTextarea}
                                    rows={4}
                                />
                                <button
                                    type="submit"
                                    disabled={sending || !replyText.trim()}
                                    style={{
                                        ...styles.replyButton,
                                        ...(sending || !replyText.trim() ? styles.replyButtonDisabled : {})
                                    }}
                                >
                                    {sending ? 'Sending...' : 'Send Reply'}
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Godspeed Design System Styles
const styles = {
    container: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRadius: '24px',
        border: '1px solid rgba(0, 0, 0, 0.05)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
        overflow: 'hidden',
        maxWidth: '1200px',
        margin: '0 auto'
    },
    header: {
        padding: '2rem',
        borderBottom: '1px solid rgba(0, 0, 0, 0.1)'
    },
    title: {
        fontSize: '2rem',
        fontWeight: '800',
        color: '#1d1d1f',
        margin: '0 0 0.5rem 0',
        textTransform: 'uppercase',
        letterSpacing: '-0.02em'
    },
    subtitle: {
        fontSize: '0.95rem',
        color: '#86868b',
        margin: 0
    },
    layout: {
        display: 'grid',
        gridTemplateColumns: '400px 1fr',
        minHeight: '600px'
    },
    messageList: {
        borderRight: '1px solid rgba(0, 0, 0, 0.1)',
        overflowY: 'auto',
        maxHeight: '600px'
    },
    messageItem: {
        padding: '1rem 1.5rem',
        borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
        cursor: 'pointer',
        transition: 'background-color 0.2s ease'
    },
    messageItemActive: {
        backgroundColor: 'rgba(0, 113, 227, 0.05)'
    },
    messageItemUnread: {
        backgroundColor: 'rgba(0, 113, 227, 0.02)'
    },
    messageHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.5rem'
    },
    messageSubject: {
        fontSize: '1rem',
        fontWeight: '500',
        color: '#888888'
    },
    messageSubjectUnread: {
        fontWeight: '700',
        color: '#FFFFFF'
    },
    unreadBadge: {
        color: '#2563eb',
        fontSize: '1.5rem',
        lineHeight: 1
    },
    messageMeta: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.85rem',
        color: '#86868b'
    },
    messageSender: {},
    messageDate: {},
    messageDetail: {
        padding: '2rem',
        overflowY: 'auto',
        maxHeight: '600px'
    },
    detailHeader: {
        marginBottom: '2rem',
        paddingBottom: '1rem',
        borderBottom: '1px solid rgba(0, 0, 0, 0.1)'
    },
    detailSubject: {
        fontSize: '1.5rem',
        fontWeight: '700',
        color: '#1d1d1f',
        margin: '0 0 0.5rem 0'
    },
    detailMeta: {
        display: 'flex',
        gap: '1rem',
        fontSize: '0.9rem',
        color: '#86868b'
    },
    detailBody: {
        marginBottom: '2rem',
        lineHeight: '1.6',
        color: '#1d1d1f'
    },
    bodyParagraph: {
        margin: '0 0 1rem 0'
    },
    replySection: {
        borderTop: '1px solid rgba(0, 0, 0, 0.1)',
        paddingTop: '2rem'
    },
    replyTitle: {
        fontSize: '1rem',
        fontWeight: '700',
        color: '#1d1d1f',
        margin: '0 0 1rem 0',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
    },
    replyTextarea: {
        width: '100%',
        padding: '1rem',
        fontSize: '1rem',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        borderRadius: '12px',
        backgroundColor: '#ffffff',
        color: '#1d1d1f',
        fontFamily: 'Inter, sans-serif',
        resize: 'vertical',
        lineHeight: '1.6',
        marginBottom: '1rem'
    },
    replyButton: {
        padding: '0.75rem 1.5rem',
        fontSize: '0.9rem',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: '#ffffff',
        backgroundColor: '#2563eb',
        border: 'none',
        borderRadius: '999px',
        cursor: 'pointer',
        transition: 'all 0.3s ease'
    },
    replyButtonDisabled: {
        opacity: 0.5,
        cursor: 'not-allowed'
    },
    loading: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4rem',
        color: '#86868b'
    },
    spinner: {
        width: '40px',
        height: '40px',
        border: '3px solid rgba(0, 113, 227, 0.1)',
        borderTop: '3px solid #2563eb',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: '1rem'
    },
    error: {
        padding: '2rem',
        textAlign: 'center',
        color: '#ff3b30'
    },
    retryButton: {
        marginTop: '1rem',
        padding: '0.75rem 1.5rem',
        fontSize: '0.9rem',
        fontWeight: '600',
        color: '#ffffff',
        backgroundColor: '#2563eb',
        border: 'none',
        borderRadius: '999px',
        cursor: 'pointer'
    },
    emptyState: {
        padding: '4rem 2rem',
        textAlign: 'center',
        color: '#86868b'
    }
};
