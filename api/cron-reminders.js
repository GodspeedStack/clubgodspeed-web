export default async function handler(req, res) {
  // Verify Cron Request (Vercel specific header)
  if (req.headers.authorization !== \`Bearer \${process.env.CRON_SECRET}\`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase credentials in environment");
    }

    // Dynamic import to avoid build issues if purely used as serverless
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all pending payments
    const { data: payments, error: payError } = await supabase
      .from('payments')
      .select('*, payment_plans(*)')
      .eq('status', 'pending');

    if (payError) throw payError;

    const now = new Date();
    const results = [];

    for (const payment of payments) {
      const dueDate = new Date(payment.due_date);
      const diffTime = dueDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      let reminderType = null;
      
      if (diffDays === 7) reminderType = 'upcoming_7';
      else if (diffDays === 1) reminderType = 'upcoming_1';
      else if (diffDays === 0) reminderType = 'due_today';
      else if (diffDays === -3) reminderType = 'overdue_3';
      else if (diffDays === -7) reminderType = 'overdue_7';

      if (reminderType) {
        // Check if reminder was already sent
        const { data: existing } = await supabase
          .from('payment_reminders')
          .select('id')
          .eq('payment_id', payment.id)
          .eq('reminder_type', reminderType)
          .single();

        if (!existing) {
          // Invoke Edge Function for sending email
          const { error: invokeErr } = await supabase.functions.invoke('send-email', {
            body: {
              type: 'reminder',
              reminderType: reminderType,
              paymentId: payment.id,
              amount: payment.amount,
              dueDate: payment.due_date,
              email: payment.parent_id // assuming parent_id can be mapped to email or we pass parent_id
            }
          });

          if (!invokeErr) {
            // Log reminder
            await supabase.from('payment_reminders').insert({
              payment_id: payment.id,
              reminder_type: reminderType,
              sent_at: new Date().toISOString()
            });
            results.push({ payment: payment.id, type: reminderType, status: 'sent' });
          } else {
            console.error(\`Failed to send \${reminderType} for payment \${payment.id}\`, invokeErr);
            results.push({ payment: payment.id, type: reminderType, status: 'failed', error: invokeErr });
          }
        }
      }
    }

    res.status(200).json({ success: true, processed: results.length, details: results });
  } catch (error) {
    console.error("Cron script error:", error);
    res.status(500).json({ error: error.message });
  }
}
