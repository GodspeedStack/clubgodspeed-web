// supabase/functions/exports/index.ts
// Exports API - Create, check status, and download CSV exports

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateAttendanceCSV,
  generatePurchasesCSV,
  generateReceiptsCSV,
  generateInvoicesCSV,
} from "./generate-csv.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required", code: "AUTH_REQUIRED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication", code: "AUTH_REQUIRED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter((p) => p && p !== "index.ts");
    const lastPart = pathParts[pathParts.length - 1];
    const isDownload = lastPart === "download" && pathParts.length > 1;
    const exportId = isDownload ? pathParts[pathParts.length - 2] : lastPart;

    // Get user role
    const { data: parentAccount } = await supabase
      .from("parent_accounts")
      .select("id")
      .eq("user_id", user.id)
      .single();

    const userRole = parentAccount ? "parent" : "coach"; // TODO: Check coach_accounts table

    // Handle POST - Create export
    if (req.method === "POST" && !exportId) {
      const body = await req.json();
      const { type, parentId, athleteId, from, to } = body;

      if (!type) {
        return new Response(
          JSON.stringify({ error: "type is required", code: "VALIDATION_ERROR" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const validTypes = ["attendance_csv", "purchases_csv", "receipts_csv", "invoices_csv"];
      if (!validTypes.includes(type)) {
        return new Response(
          JSON.stringify({ error: "Invalid export type. Must be: attendance_csv, purchases_csv, receipts_csv, or invoices_csv", code: "VALIDATION_ERROR" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // CRITICAL: Infer scope from auth - DO NOT trust client-provided parentId
      if (!parentAccount) {
        return new Response(
          JSON.stringify({ error: "Parent account not found", code: "NOT_FOUND" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Use authenticated parent's ID, ignore any client-provided parentId
      const authenticatedParentId = parentAccount.id;

      // Verify athlete ownership if athleteId provided
      if (athleteId) {
        const { data: purchase } = await supabase
          .from("training_purchases")
          .select("athlete_id")
          .eq("parent_id", authenticatedParentId)
          .eq("athlete_id", athleteId)
          .limit(1)
          .single();

        if (!purchase) {
          // Also check enrollments
          const { data: enrollment } = await supabase
            .from("player_enrollments")
            .select("athlete_id")
            .eq("parent_id", authenticatedParentId)
            .eq("athlete_id", athleteId)
            .limit(1)
            .single();

          if (!enrollment) {
            return new Response(
              JSON.stringify({ error: "Athlete not found or access denied", code: "FORBIDDEN" }),
              { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      // Create export record
      const { data: exportRecord, error: exportError } = await supabase
        .from("exports")
        .insert({
          user_id: user.id,
          role: userRole,
          athlete_id: athleteId || null,
          export_type: type,
          status: "queued",
          from_date: from || null,
          to_date: to || null,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (exportError) throw exportError;

      // Log audit
      await supabase.rpc("log_export_audit", {
        p_user_id: user.id,
        p_role: userRole,
        p_athlete_id: athleteId || null,
        p_export_type: type,
        p_export_id: exportRecord.id,
        p_status: "requested",
        p_ip_address: req.headers.get("x-forwarded-for") || null,
        p_user_agent: req.headers.get("user-agent") || null,
      });

      // Generate CSV immediately (for V1, process synchronously)
      try {
        await supabase
          .from("exports")
          .update({ status: "running" })
          .eq("id", exportRecord.id);

        let csvContent = "";

        switch (type) {
          case "attendance_csv":
            csvContent = await generateAttendanceCSV(supabase, authenticatedParentId, athleteId, from, to);
            break;
          case "purchases_csv":
            csvContent = await generatePurchasesCSV(supabase, authenticatedParentId, athleteId, from, to);
            break;
          case "receipts_csv":
            csvContent = await generateReceiptsCSV(supabase, authenticatedParentId, athleteId, from, to);
            break;
          case "invoices_csv":
            csvContent = await generateInvoicesCSV(supabase, authenticatedParentId, athleteId, from, to);
            break;
        }

        // Upload to storage
        const fileName = `${type}_${exportRecord.id}_${Date.now()}.csv`;
        const { error: uploadError } = await supabase.storage
          .from("exports")
          .upload(fileName, new TextEncoder().encode(csvContent), {
            contentType: "text/csv",
            upsert: true,
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage.from("exports").getPublicUrl(fileName);

        // Update export record
        await supabase
          .from("exports")
          .update({
            status: "ready",
            file_url: urlData.publicUrl,
            file_size: new TextEncoder().encode(csvContent).length,
            completed_at: new Date().toISOString(),
          })
          .eq("id", exportRecord.id);

        // Log audit
        await supabase.rpc("log_export_audit", {
          p_user_id: user.id,
          p_role: userRole,
          p_athlete_id: athleteId || null,
          p_export_type: type,
          p_export_id: exportRecord.id,
          p_status: "completed",
        });

        return new Response(JSON.stringify({ id: exportRecord.id, status: "ready", downloadUrl: urlData.publicUrl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } catch (error) {
        console.error("Export generation error:", error);
        await supabase
          .from("exports")
          .update({
            status: "failed",
            error_message: error.message,
            completed_at: new Date().toISOString(),
          })
          .eq("id", exportRecord.id);

        await supabase.rpc("log_export_audit", {
          p_user_id: user.id,
          p_role: userRole,
          p_athlete_id: athleteId || null,
          p_export_type: type,
          p_export_id: exportRecord.id,
          p_status: "failed",
        });

        throw error;
      }
    }

    // Handle GET - Get export status or download
    if (req.method === "GET") {
      if (!exportId) {
        return new Response(
          JSON.stringify({ error: "Export ID required", code: "VALIDATION_ERROR" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get export record
      const { data: exportRecord, error: exportError } = await supabase
        .from("exports")
        .select("*")
        .eq("id", exportId)
        .eq("user_id", user.id)
        .single();

      if (exportError || !exportRecord) {
        return new Response(
          JSON.stringify({ error: "Export not found", code: "NOT_FOUND" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Handle download
      if (isDownload) {
        if (exportRecord.status !== "ready" || !exportRecord.file_url) {
          return new Response(
            JSON.stringify({ error: "Export not ready", code: "VALIDATION_ERROR" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Log download
        await supabase.rpc("log_export_audit", {
          p_user_id: user.id,
          p_role: userRole,
          p_athlete_id: exportRecord.athlete_id,
          p_export_type: exportRecord.export_type,
          p_export_id: exportRecord.id,
          p_status: "downloaded",
          p_ip_address: req.headers.get("x-forwarded-for") || null,
          p_user_agent: req.headers.get("user-agent") || null,
        });

        // Fetch file from storage
        const filePath = exportRecord.file_url.split("/").slice(-2).join("/");
        const { data: fileData, error: fileError } = await supabase.storage
          .from("exports")
          .download(filePath);

        if (fileError || !fileData) {
          return new Response(
            JSON.stringify({ error: "File not found", code: "NOT_FOUND" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const arrayBuffer = await fileData.arrayBuffer();
        const fileName = `${exportRecord.export_type}_${exportRecord.id}.csv`;

        return new Response(arrayBuffer, {
          headers: {
            ...corsHeaders,
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="${fileName}"`,
          },
          status: 200,
        });
      }

      // Return status
      return new Response(
        JSON.stringify({
          id: exportRecord.id,
          status: exportRecord.status,
          downloadUrl: exportRecord.file_url,
          createdAt: exportRecord.created_at,
          completedAt: exportRecord.completed_at,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed", code: "VALIDATION_ERROR" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message, code: "SERVER_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
