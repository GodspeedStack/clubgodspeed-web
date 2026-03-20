import { Resend } from 'resend';

// Initialize Resend client
const resendApiKey = import.meta.env.VITE_RESEND_API_KEY;

if (!resendApiKey) {
    console.error('Missing Resend API key');
    throw new Error('Resend configuration is incomplete. Please check your .env file.');
}

const resend = new Resend(resendApiKey);

/**
 * Send a single email via Resend
 * 
 * @param {Object} emailData - Email configuration
 * @param {string} emailData.from - Sender email address
 * @param {string|string[]} emailData.to - Recipient email address(es)
 * @param {string} emailData.subject - Email subject
 * @param {string} emailData.html - HTML email body
 * @param {Object} emailData.tags - Optional tags for tracking
 * @returns {Promise<Object>} Resend API response with email ID
 */
export const sendEmail = async (emailData) => {
    try {
        const { data, error } = await resend.emails.send(emailData);

        if (error) {
            console.error('Resend API error:', error);
            throw error;
        }

        return data;
    } catch (err) {
        console.error('Failed to send email:', err);
        throw err;
    }
};

/**
 * Send batch emails via Resend
 * 
 * @param {Array<Object>} emails - Array of email configurations
 * @returns {Promise<Array>} Array of Resend API responses
 */
export const sendBatchEmails = async (emails) => {
    try {
        const { data, error } = await resend.batch.send(emails);

        if (error) {
            console.error('Resend batch API error:', error);
            throw error;
        }

        return data;
    } catch (err) {
        console.error('Failed to send batch emails:', err);
        throw err;
    }
};

/**
 * Get email delivery status from Resend
 * 
 * @param {string} emailId - Resend email ID
 * @returns {Promise<Object>} Email status information
 */
export const getEmailStatus = async (emailId) => {
    try {
        const { data, error } = await resend.emails.get(emailId);

        if (error) {
            console.error('Resend API error:', error);
            throw error;
        }

        return data;
    } catch (err) {
        console.error('Failed to get email status:', err);
        throw err;
    }
};

export default resend;
