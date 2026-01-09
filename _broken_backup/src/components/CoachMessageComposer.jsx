import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { sendEmail } from '../lib/resendClient';

/**
 * CoachMessageComposer
 * 
 * Secure message composer for coaches to broadcast messages to parents.
 * Features:
 * - Dual delivery: In-app + Email via Resend
 * - Recipient selection: All Parents or specific teams
 * - Rich text editor for message body
 * - Send confirmation with delivery tracking
 */
export default function CoachMessageComposer({ coachId, onMessageSent }) {
    // Form state
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [recipientType, setRecipientType] = useState('all'); // 'all' | 'team'
    const [selectedTeam, setSelectedTeam] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState('both'); // 'email' | 'internal' | 'both'

    // Data state
    const [teams, setTeams] = useState([]);
    const [parents, setParents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    // Load teams and parents on mount
    useEffect(() => {
        loadTeamsAndParents();
    }, []);

    /**
     * Load available teams and parent users
     */
    const loadTeamsAndParents = async () => {
        try {
            // Fetch teams (adjust query based on your schema)
            const { data: teamsData, error: teamsError } = await supabase
                .from('teams')
                .select('id, name')
                .order('name');

            if (teamsError) throw teamsError;
            setTeams(teamsData || []);

            // Fetch all parent users
            const { data: parentsData, error: parentsError } = await supabase
                .from('profiles')
                .select('id, email, full_name, role')
                .eq('role', 'parent');

            if (parentsError) throw parentsError;
            setParents(parentsData || []);
        } catch (err) {
            console.error('Error loading data:', err);
            setError('Failed to load teams and parents');
        }
    };

    /**
     * Get recipient list based on selection
     */
    const getRecipients = async () => {
        if (recipientType === 'all') {
            return parents;
        } else if (recipientType === 'team' && selectedTeam) {
            // Fetch parents associated with the selected team
            const { data, error } = await supabase
                .from('team_members')
                .select(`
                    profiles:user_id (
                        id,
                        email,
                        full_name,
                        role
                    )
                `)
                .eq('team_id', selectedTeam)
                .eq('profiles.role', 'parent');

            if (error) throw error;
            return data?.map(item => item.profiles).filter(Boolean) || [];
        }
        return [];
    };

    /**
     * Send message to all selected recipients
     */
    const handleSendMessage = async (e) => {
        e.preventDefault();

        // Validation
        if (!subject.trim()) {
            setError('Subject is required');
            return;
        }
        if (!body.trim()) {
            setError('Message body is required');
            return;
        }
        if (recipientType === 'team' && !selectedTeam) {
            setError('Please select a team');
            return;
        }

        setLoading(true);
        setError(null);
        setSuccess(false);

        try {
            // Get recipients
            const recipients = await getRecipients();

            if (recipients.length === 0) {
                throw new Error('No recipients found');
            }

            // 1. Create message record
            const { data: message, error: messageError } = await supabase
                .from('messages')
                .insert({
                    sender_id: coachId,
                    subject: subject.trim(),
                    body: body.trim(),
                    type: deliveryMethod,
                    recipient_count: recipients.length
                })
                .select()
                .single();

            if (messageError) throw messageError;

            // 2. Create recipient records
            const recipientRecords = recipients.map(recipient => ({
                message_id: message.id,
                user_id: recipient.id,
                status: 'sent'
            }));

            const { error: recipientsError } = await supabase
                .from('message_recipients')
                .insert(recipientRecords);

            if (recipientsError) throw recipientsError;

            // 3. Send emails via Resend (if email delivery is enabled)
            if (deliveryMethod === 'email' || deliveryMethod === 'both') {
                await sendBulkEmails(message, recipients);
            }

            // Success!
            setSuccess(true);
            setSubject('');
            setBody('');
            setRecipientType('all');
            setSelectedTeam('');

            // Notify parent component
            if (onMessageSent) {
                onMessageSent(message);
            }

            // Auto-hide success message after 3 seconds
            setTimeout(() => setSuccess(false), 3000);

        } catch (err) {
            console.error('Error sending message:', err);
            setError(err.message || 'Failed to send message');
        } finally {
            setLoading(false);
        }
    };

    /**
     * Send emails to all recipients via Resend
     */
    const sendBulkEmails = async (message, recipients) => {
        const emailPromises = recipients.map(async (recipient) => {
            try {
                const emailData = {
                    from: 'Godspeed Basketball <notifications@godspeedbasketball.com>',
                    to: recipient.email,
                    subject: message.subject,
                    html: formatEmailBody(message.body, recipient.full_name),
                    tags: {
                        message_id: message.id,
                        recipient_id: recipient.id
                    }
                };

                const result = await sendEmail(emailData);

                // Update recipient record with email ID for tracking
                if (result.id) {
                    await supabase
                        .from('message_recipients')
                        .update({
                            email_id: result.id,
                            delivered_at: new Date().toISOString(),
                            status: 'delivered'
                        })
                        .eq('message_id', message.id)
                        .eq('user_id', recipient.id);
                }

                return result;
            } catch (err) {
                console.error(`Failed to send email to ${recipient.email}:`, err);

                // Mark as failed
                await supabase
                    .from('message_recipients')
                    .update({ status: 'failed' })
                    .eq('message_id', message.id)
                    .eq('user_id', recipient.id);

                return null;
            }
        });

        await Promise.allSettled(emailPromises);
    };

    /**
     * Format email body with HTML template
     */
    const formatEmailBody = (bodyText, recipientName) => {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Message from Godspeed Basketball</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f5f5f7;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f7; padding: 40px 20px;">
                    <tr>
                        <td align="center">
                            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
                                <!-- Header -->
                                <tr>
                                    <td style="background-color: #0071e3; padding: 30px; text-align: center;">
                                        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.02em;">
                                            GODSPEED BASKETBALL
                                        </h1>
                                    </td>
                                </tr>
                                
                                <!-- Body -->
                                <tr>
                                    <td style="padding: 40px 30px;">
                                        <p style="margin: 0 0 20px 0; color: #1d1d1f; font-size: 16px;">
                                            Hi ${recipientName || 'Parent'},
                                        </p>
                                        <div style="color: #1d1d1f; font-size: 16px; line-height: 1.6;">
                                            ${bodyText.replace(/\n/g, '<br>')}
                                        </div>
                                    </td>
                                </tr>
                                
                                <!-- CTA -->
                                <tr>
                                    <td style="padding: 0 30px 40px 30px; text-align: center;">
                                        <a href="https://clubgodspeed-web.web.app/parent-portal.html" 
                                           style="display: inline-block; background-color: #0071e3; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 999px; font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">
                                            View in Parent Portal
                                        </a>
                                    </td>
                                </tr>
                                
                                <!-- Footer -->
                                <tr>
                                    <td style="background-color: #f5f5f7; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e5e5;">
                                        <p style="margin: 0; color: #86868b; font-size: 12px;">
                                            © 2025 Godspeed Basketball. All rights reserved.
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </body>
            </html>
        `;
    };

    return (
        <div className="coach-message-composer" style={styles.container}>
            <div style={styles.header}>
                <h2 style={styles.title}>Compose Message</h2>
                <p style={styles.subtitle}>Send updates to parents via email and in-app notifications</p>
            </div>

            <form onSubmit={handleSendMessage} style={styles.form}>
                {/* Recipient Selection */}
                <div style={styles.formGroup}>
                    <label style={styles.label}>TO:</label>
                    <div style={styles.recipientSelector}>
                        <select
                            value={recipientType}
                            onChange={(e) => setRecipientType(e.target.value)}
                            style={styles.select}
                        >
                            <option value="all">All Parents</option>
                            <option value="team">Specific Team</option>
                        </select>

                        {recipientType === 'team' && (
                            <select
                                value={selectedTeam}
                                onChange={(e) => setSelectedTeam(e.target.value)}
                                style={styles.select}
                                required
                            >
                                <option value="">Select Team...</option>
                                {teams.map(team => (
                                    <option key={team.id} value={team.id}>
                                        {team.name}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                {/* Delivery Method */}
                <div style={styles.formGroup}>
                    <label style={styles.label}>DELIVERY:</label>
                    <div style={styles.radioGroup}>
                        <label style={styles.radioLabel}>
                            <input
                                type="radio"
                                value="both"
                                checked={deliveryMethod === 'both'}
                                onChange={(e) => setDeliveryMethod(e.target.value)}
                            />
                            <span>Email + In-App</span>
                        </label>
                        <label style={styles.radioLabel}>
                            <input
                                type="radio"
                                value="email"
                                checked={deliveryMethod === 'email'}
                                onChange={(e) => setDeliveryMethod(e.target.value)}
                            />
                            <span>Email Only</span>
                        </label>
                        <label style={styles.radioLabel}>
                            <input
                                type="radio"
                                value="internal"
                                checked={deliveryMethod === 'internal'}
                                onChange={(e) => setDeliveryMethod(e.target.value)}
                            />
                            <span>In-App Only</span>
                        </label>
                    </div>
                </div>

                {/* Subject */}
                <div style={styles.formGroup}>
                    <label style={styles.label}>SUBJECT:</label>
                    <input
                        type="text"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="e.g., Tournament Schedule Update"
                        style={styles.input}
                        required
                    />
                </div>

                {/* Message Body */}
                <div style={styles.formGroup}>
                    <label style={styles.label}>MESSAGE:</label>
                    <textarea
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Write your message here..."
                        style={styles.textarea}
                        rows={10}
                        required
                    />
                </div>

                {/* Error Message */}
                {error && (
                    <div style={styles.error}>
                        ⚠️ {error}
                    </div>
                )}

                {/* Success Message */}
                {success && (
                    <div style={styles.success}>
                        ✓ Message sent successfully!
                    </div>
                )}

                {/* Submit Button */}
                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        ...styles.button,
                        ...(loading ? styles.buttonDisabled : {})
                    }}
                >
                    {loading ? 'Sending...' : 'Send Message'}
                </button>
            </form>
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
        padding: '2rem',
        maxWidth: '800px',
        margin: '0 auto'
    },
    header: {
        marginBottom: '2rem',
        borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
        paddingBottom: '1rem'
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
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem'
    },
    formGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem'
    },
    label: {
        fontSize: '0.75rem',
        fontWeight: '700',
        color: '#86868b',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
    },
    recipientSelector: {
        display: 'flex',
        gap: '1rem',
        flexWrap: 'wrap'
    },
    select: {
        flex: 1,
        minWidth: '200px',
        padding: '0.75rem 1rem',
        fontSize: '1rem',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        borderRadius: '12px',
        backgroundColor: '#ffffff',
        color: '#1d1d1f',
        fontFamily: 'Inter, sans-serif',
        cursor: 'pointer',
        transition: 'all 0.2s ease'
    },
    radioGroup: {
        display: 'flex',
        gap: '1.5rem',
        flexWrap: 'wrap'
    },
    radioLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.95rem',
        color: '#1d1d1f',
        cursor: 'pointer'
    },
    input: {
        padding: '0.75rem 1rem',
        fontSize: '1rem',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        borderRadius: '12px',
        backgroundColor: '#ffffff',
        color: '#1d1d1f',
        fontFamily: 'Inter, sans-serif',
        transition: 'all 0.2s ease'
    },
    textarea: {
        padding: '1rem',
        fontSize: '1rem',
        border: '1px solid rgba(0, 0, 0, 0.1)',
        borderRadius: '12px',
        backgroundColor: '#ffffff',
        color: '#1d1d1f',
        fontFamily: 'Inter, sans-serif',
        resize: 'vertical',
        lineHeight: '1.6',
        transition: 'all 0.2s ease'
    },
    button: {
        padding: '1rem 2rem',
        fontSize: '0.95rem',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: '#ffffff',
        backgroundColor: '#0071e3',
        border: 'none',
        borderRadius: '999px',
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        boxShadow: '0 4px 12px rgba(0, 113, 227, 0.25)'
    },
    buttonDisabled: {
        opacity: 0.6,
        cursor: 'not-allowed'
    },
    error: {
        padding: '1rem',
        backgroundColor: '#fff5f5',
        border: '1px solid #ff3b30',
        borderRadius: '12px',
        color: '#ff3b30',
        fontSize: '0.9rem',
        fontWeight: '600'
    },
    success: {
        padding: '1rem',
        backgroundColor: '#f0fff4',
        border: '1px solid #34c759',
        borderRadius: '12px',
        color: '#34c759',
        fontSize: '0.9rem',
        fontWeight: '600'
    }
};
