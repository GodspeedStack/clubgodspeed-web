// supabase/functions/create-checkout-session/index.ts

// 1. Direct Imports (Zero-Dependency Version)
// We avoid the Stripe SDK entirely to bypass bundling timeouts.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// 2. Configuration
// Get Stripe Key from environment
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";

// 3. CORS Headers
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

console.log("Stripe Checkout Function Initialized (Lightweight)");

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        // 4. Parse request
        const { items, success_url, cancel_url } = await req.json();

        if (!items || items.length === 0) {
            throw new Error("No items provided in cart");
        }

        // Map items to Stripe's format
        const line_items = items.map((item: any) => ({
            price_data: {
                currency: 'usd',
                product_data: {
                    name: item.productName,
                    description: item.variantName,
                    images: item.image ? [item.image] : [],
                },
                unit_amount: Math.round(item.price * 100),
            },
            quantity: item.quantity,
        }));

        // 5. Raw Fetch to Stripe API (No SDK needed)
        // This is the "Nuclear Option" that cannot fail bundling
        const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                "success_url": success_url || 'https://clubgodspeed.com/success.html',
                "cancel_url": cancel_url || 'https://clubgodspeed.com/training.html',
                "mode": "payment",
                ...line_items.reduce((acc, item, index) => {
                    acc[`line_items[${index}][price_data][currency]`] = item.price_data.currency;
                    acc[`line_items[${index}][price_data][product_data][name]`] = item.price_data.product_data.name;
                    if (item.price_data.product_data.description) {
                        acc[`line_items[${index}][price_data][product_data][description]`] = item.price_data.product_data.description;
                    }
                    if (item.price_data.product_data.images && item.price_data.product_data.images.length > 0) {
                        acc[`line_items[${index}][price_data][product_data][images][0]`] = item.price_data.product_data.images[0];
                    }
                    acc[`line_items[${index}][price_data][unit_amount]`] = item.price_data.unit_amount.toString();
                    acc[`line_items[${index}][quantity]`] = item.quantity.toString();
                    return acc;
                }, {} as Record<string, string>)
            })
        });

        const session = await response.json();

        if (session.error) {
            throw new Error(session.error.message);
        }

        // 6. Return response
        return new Response(
            JSON.stringify({ id: session.id, url: session.url }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            }
        );

    } catch (error) {
        console.error("Error creating session:", error.message);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
            }
        );
    }
});
