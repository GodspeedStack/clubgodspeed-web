import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function errorResponse(code: string, message: string, status = 400, details: Record<string, unknown> = {}) {
  return jsonResponse({ error: { code, message, details } }, status);
}

function decodeCursor(cursor: string | null) {
  if (!cursor) return null;
  try {
    const decoded = atob(cursor);
    const parsed = JSON.parse(decoded);
    if (!parsed.createdAt || !parsed.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function encodeCursor(createdAt: string, id: string) {
  return btoa(JSON.stringify({ createdAt, id }));
}

function displayNameFor(profile?: { first_name?: string | null; last_name?: string | null; email?: string | null }) {
  const first = profile?.first_name?.trim() || "";
  const last = profile?.last_name?.trim() || "";
  if (first || last) {
    return [first, last].filter(Boolean).join(" ");
  }
  return profile?.email || "Direct Message";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return errorResponse("SERVER_ERROR", "Supabase environment is not configured.", 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return errorResponse("UNAUTHENTICATED", "Missing access token.", 401);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return errorResponse("UNAUTHENTICATED", "Invalid access token.", 401);
  }

  const userId = authData.user.id;
  const url = new URL(req.url);
  const basePath = "/functions/v1/messaging-api";
  const path = url.pathname.startsWith(basePath)
    ? url.pathname.slice(basePath.length)
    : url.pathname;

  if (req.method === "GET" && path === "/conversations") {
    const { data: memberships, error: membershipError } = await supabase
      .from("team_memberships")
      .select("team_id")
      .eq("user_id", userId)
      .eq("status", "active");

    if (membershipError) {
      return errorResponse("SERVER_ERROR", "Failed to load team memberships.", 500, { message: membershipError.message });
    }

    const teamIds = (memberships || []).map((m) => m.team_id);

    const { data: teamConversations, error: teamConvError } = await supabase
      .from("conversations")
      .select("id,type,team_id,created_at")
      .eq("type", "team")
      .in("team_id", teamIds.length ? teamIds : ["00000000-0000-0000-0000-000000000000"]);

    if (teamConvError) {
      return errorResponse("SERVER_ERROR", "Failed to load team conversations.", 500, { message: teamConvError.message });
    }

    const teamConversationList = [...(teamConversations || [])];
    const existingTeamConversationIds = new Set(teamConversationList.map((c) => c.team_id));
    const missingTeamIds = teamIds.filter((id) => !existingTeamConversationIds.has(id));

    if (missingTeamIds.length) {
      const { data: createdTeams, error: createdTeamError } = await supabase
        .from("conversations")
        .insert(missingTeamIds.map((teamId) => ({
          type: "team",
          team_id: teamId,
          created_by: userId
        })))
        .select("id,type,team_id,created_at");

      if (createdTeamError) {
        return errorResponse("SERVER_ERROR", "Failed to create team conversations.", 500, { message: createdTeamError.message });
      }

      if (createdTeams?.length) {
        teamConversationList.push(...createdTeams);
      }
    }

    const { data: directParticipants, error: directError } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", userId);

    if (directError) {
      return errorResponse("SERVER_ERROR", "Failed to load direct conversations.", 500, { message: directError.message });
    }

    const directIds = (directParticipants || []).map((row) => row.conversation_id);

    const { data: directConversations, error: directConvError } = await supabase
      .from("conversations")
      .select("id,type,team_id,created_at")
      .eq("type", "direct")
      .in("id", directIds.length ? directIds : ["00000000-0000-0000-0000-000000000000"]);

    if (directConvError) {
      return errorResponse("SERVER_ERROR", "Failed to load direct conversation details.", 500, { message: directConvError.message });
    }

    const teamMap = new Map<string, string>();
    if (teamIds.length) {
      const { data: teamRows } = await supabase
        .from("teams")
        .select("id,name")
        .in("id", teamIds);
      (teamRows || []).forEach((team) => teamMap.set(team.id, team.name));
    }

    const directParticipantRows = directIds.length
      ? await supabase
          .from("conversation_participants")
          .select("conversation_id,user_id")
          .in("conversation_id", directIds)
      : { data: [], error: null };

    if (directParticipantRows.error) {
      return errorResponse("SERVER_ERROR", "Failed to load direct participants.", 500, { message: directParticipantRows.error.message });
    }

    const otherParticipantIds = new Set<string>();
    (directParticipantRows.data || []).forEach((row) => {
      if (row.user_id !== userId) {
        otherParticipantIds.add(row.user_id);
      }
    });

    const profileMap = new Map<string, { first_name?: string | null; last_name?: string | null; email?: string | null }>();
    if (otherParticipantIds.size) {
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id,first_name,last_name,email")
        .in("id", Array.from(otherParticipantIds));
      (profiles || []).forEach((profile) => {
        profileMap.set(profile.id, profile);
      });
    }

    const allConversations = [...teamConversationList, ...(directConversations || [])];

    const conversations = await Promise.all(
      allConversations.map(async (conversation) => {
        const { data: lastMessage } = await supabase
          .from("conversation_messages")
          .select("id,conversation_id,sender_id,body,created_at")
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let title = "Conversation";
        if (conversation.type === "team") {
          title = teamMap.get(conversation.team_id) || "Team Chat";
        } else {
          const otherParticipant = (directParticipantRows.data || []).find(
            (row) => row.conversation_id === conversation.id && row.user_id !== userId
          );
          const profile = otherParticipant ? profileMap.get(otherParticipant.user_id) : undefined;
          title = displayNameFor(profile);
        }

        return {
          id: conversation.id,
          type: conversation.type,
          teamId: conversation.team_id,
          title,
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                senderId: lastMessage.sender_id,
                body: lastMessage.body,
                createdAt: lastMessage.created_at
              }
            : null,
          unreadCount: 0,
          updatedAt: lastMessage?.created_at || conversation.created_at
        };
      })
    );

    return jsonResponse({ conversations });
  }

  if (req.method === "GET" && path.startsWith("/conversations/") && path.endsWith("/messages")) {
    const parts = path.split("/");
    const conversationId = parts[2];
    const limitParam = url.searchParams.get("limit");
    const cursorParam = url.searchParams.get("cursor");
    const limit = Math.min(Math.max(parseInt(limitParam || "25", 10) || 25, 1), 50);

    const cursor = decodeCursor(cursorParam);

    let query = supabase
      .from("conversation_messages")
      .select("id,conversation_id,sender_id,body,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
      );
    }

    const { data: messages, error } = await query;
    if (error) {
      return errorResponse("FORBIDDEN", "Unable to load messages.", 403, { message: error.message });
    }

    const page = messages || [];
    const hasMore = page.length > limit;
    const pageItems = hasMore ? page.slice(0, limit) : page;
    const lastItem = pageItems[pageItems.length - 1];

    return jsonResponse({
      messages: pageItems.map((msg) => ({
        id: msg.id,
        conversationId: msg.conversation_id,
        senderId: msg.sender_id,
        body: msg.body,
        createdAt: msg.created_at
      })),
      nextCursor: hasMore && lastItem ? encodeCursor(lastItem.created_at, lastItem.id) : null
    });
  }

  if (req.method === "POST" && path.startsWith("/conversations/") && path.endsWith("/messages")) {
    const parts = path.split("/");
    const conversationId = parts[2];
    let payload: { body?: string } = {};

    try {
      payload = await req.json();
    } catch {
      return errorResponse("VALIDATION_ERROR", "Invalid JSON body.", 400);
    }

    const body = (payload.body || "").trim();
    if (!body || body.length > 2000) {
      return errorResponse("VALIDATION_ERROR", "Message body must be 1-2000 characters.", 400);
    }

    const { data: message, error } = await supabase
      .from("conversation_messages")
      .insert({
        conversation_id: conversationId,
        sender_id: userId,
        body
      })
      .select("id,conversation_id,sender_id,body,created_at")
      .single();

    if (error) {
      return errorResponse("FORBIDDEN", "Unable to send message.", 403, { message: error.message });
    }

    return jsonResponse(
      {
        message: {
          id: message.id,
          conversationId: message.conversation_id,
          senderId: message.sender_id,
          body: message.body,
          createdAt: message.created_at
        }
      },
      201
    );
  }

  if (req.method === "POST" && path === "/direct-conversations") {
    let payload: { recipientId?: string } = {};
    try {
      payload = await req.json();
    } catch {
      return errorResponse("VALIDATION_ERROR", "Invalid JSON body.", 400);
    }

    const recipientId = payload.recipientId;
    if (!recipientId) {
      return errorResponse("VALIDATION_ERROR", "recipientId is required.", 400);
    }

    const { data: eligible, error: eligibleError } = await supabase.rpc("can_direct_message", {
      p_sender_id: userId,
      p_recipient_id: recipientId
    });

    if (eligibleError) {
      return errorResponse("SERVER_ERROR", "Unable to validate eligibility.", 500, { message: eligibleError.message });
    }

    if (!eligible) {
      return errorResponse("FORBIDDEN", "Recipient is not eligible for direct messaging.", 403);
    }

    const [user1Id, user2Id] = userId < recipientId ? [userId, recipientId] : [recipientId, userId];

    const { data: existingPair } = await supabase
      .from("direct_conversation_pairs")
      .select("conversation_id")
      .eq("user1_id", user1Id)
      .eq("user2_id", user2Id)
      .maybeSingle();

    if (existingPair?.conversation_id) {
      const { data: conversation } = await supabase
        .from("conversations")
        .select("id,type,team_id,created_at")
        .eq("id", existingPair.conversation_id)
        .single();

      return jsonResponse({
        conversation: {
          id: conversation.id,
          type: conversation.type,
          teamId: conversation.team_id,
          title: "Direct Message",
          createdAt: conversation.created_at
        },
        created: false
      });
    }

    const { data: newConversation, error: convError } = await supabase
      .from("conversations")
      .insert({
        type: "direct",
        created_by: userId
      })
      .select("id,type,team_id,created_at")
      .single();

    if (convError) {
      return errorResponse("SERVER_ERROR", "Unable to create conversation.", 500, { message: convError.message });
    }

    const participants = [
      { conversation_id: newConversation.id, user_id: userId },
      { conversation_id: newConversation.id, user_id: recipientId }
    ];

    const { error: participantError } = await supabase
      .from("conversation_participants")
      .insert(participants);

    if (participantError) {
      return errorResponse("SERVER_ERROR", "Unable to add participants.", 500, { message: participantError.message });
    }

    const { error: pairError } = await supabase
      .from("direct_conversation_pairs")
      .insert({
        user1_id: user1Id,
        user2_id: user2Id,
        conversation_id: newConversation.id,
        created_by: userId
      });

    if (pairError) {
      return errorResponse("SERVER_ERROR", "Unable to finalize conversation.", 500, { message: pairError.message });
    }

    return jsonResponse({
      conversation: {
        id: newConversation.id,
        type: newConversation.type,
        teamId: newConversation.team_id,
        title: "Direct Message",
        createdAt: newConversation.created_at
      },
      created: true
    });
  }

  if (req.method === "GET" && path.startsWith("/teams/") && path.endsWith("/conversation")) {
    const parts = path.split("/");
    const teamId = parts[2];

    const { data: existing, error: existingError } = await supabase
      .from("conversations")
      .select("id,type,team_id,created_at")
      .eq("type", "team")
      .eq("team_id", teamId)
      .maybeSingle();

    if (existingError) {
      return errorResponse("FORBIDDEN", "Unable to load team conversation.", 403, { message: existingError.message });
    }

    if (existing) {
      return jsonResponse({
        conversation: {
          id: existing.id,
          type: existing.type,
          teamId: existing.team_id,
          title: "Team Chat",
          createdAt: existing.created_at
        },
        created: false
      });
    }

    const { data: created, error: createError } = await supabase
      .from("conversations")
      .insert({
        type: "team",
        team_id: teamId,
        created_by: userId
      })
      .select("id,type,team_id,created_at")
      .single();

    if (createError) {
      return errorResponse("FORBIDDEN", "Unable to create team conversation.", 403, { message: createError.message });
    }

    return jsonResponse({
      conversation: {
        id: created.id,
        type: created.type,
        teamId: created.team_id,
        title: "Team Chat",
        createdAt: created.created_at
      },
      created: true
    });
  }

  if (req.method === "GET" && path === "/eligible-recipients") {
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profileError) {
      return errorResponse("SERVER_ERROR", "Unable to load user role.", 500, { message: profileError.message });
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("team_memberships")
      .select("team_id, role, user_id")
      .eq("status", "active");

    if (membershipError) {
      return errorResponse("SERVER_ERROR", "Unable to load team memberships.", 500, { message: membershipError.message });
    }

    const userTeams = memberships
      .filter((m) => m.user_id === userId)
      .map((m) => m.team_id);

    let eligibleMemberships = [];
    if (profile.role === "coach") {
      eligibleMemberships = memberships.filter(
        (m) => userTeams.includes(m.team_id) && ["parent", "athlete"].includes(m.role)
      );
    } else if (profile.role === "parent" || profile.role === "athlete") {
      eligibleMemberships = memberships.filter(
        (m) => userTeams.includes(m.team_id) && m.role === "coach"
      );
    } else if (profile.role === "admin") {
      eligibleMemberships = memberships.filter((m) => m.user_id !== userId);
    }

    const recipientIds = Array.from(new Set(eligibleMemberships.map((m) => m.user_id)));
    if (!recipientIds.length) {
      return jsonResponse({ recipients: [] });
    }

    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id,first_name,last_name,email,role")
      .in("id", recipientIds);

    const teamsByUser = new Map<string, string[]>();
    eligibleMemberships.forEach((membership) => {
      if (!teamsByUser.has(membership.user_id)) {
        teamsByUser.set(membership.user_id, []);
      }
      teamsByUser.get(membership.user_id)?.push(membership.team_id);
    });

    const recipients = (profiles || []).map((recipient) => ({
      id: recipient.id,
      displayName: displayNameFor(recipient),
      role: recipient.role,
      teamIds: teamsByUser.get(recipient.id) || []
    }));

    return jsonResponse({ recipients });
  }

  return errorResponse("NOT_FOUND", "Endpoint not found.", 404);
});
