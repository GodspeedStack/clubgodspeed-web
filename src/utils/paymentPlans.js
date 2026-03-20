export const PLANS = {
  full: {
    label: 'Pay in full',
    installments: [{ number: 1, amount: 745.00, dueDate: '2026-04-01' }]
  },
  '2-installment': {
    label: '2 installments',
    installments: [
      { number: 1, amount: 375.00, dueDate: '2026-04-01' },
      { number: 2, amount: 370.00, dueDate: '2026-06-01' }
    ]
  },
  '3-installment': {
    label: '3 installments',
    installments: [
      { number: 1, amount: 250.00, dueDate: '2026-04-01' },
      { number: 2, amount: 250.00, dueDate: '2026-05-01' },
      { number: 3, amount: 245.00, dueDate: '2026-06-01' }
    ]
  }
}

export async function createPaymentPlan(supabase, parentId, playerName, planType) {
  const plan = PLANS[planType]

  const { data: planData, error: planError } = await supabase
    .from('payment_plans')
    .insert({
      parent_id: parentId,
      player_name: playerName,
      plan_type: planType,
      total_amount: 745.00
    })
    .select()
    .single()

  if (planError) throw planError

  const installments = plan.installments.map(i => ({
    plan_id: planData.id,
    parent_id: parentId,
    installment_number: i.number,
    amount: i.amount,
    due_date: i.dueDate,
    status: 'pending'
  }))

  const { error: paymentsError } = await supabase
    .from('payments')
    .insert(installments)

  if (paymentsError) throw paymentsError

  return planData
}
