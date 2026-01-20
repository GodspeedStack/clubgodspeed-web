import { supabase } from "./supabaseClient";

const API_BASE = import.meta.env.VITE_MESSAGING_API_BASE || "/functions/v1/messaging-api";

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) {
    throw new Error("No active session.");
  }
  return data.session.access_token;
}

async function apiRequest(path, { method = "GET", body } = {}) {
  const token = await getAccessToken();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || "Request failed.";
    const error = new Error(message);
    error.code = data?.error?.code;
    throw error;
  }

  return data;
}

export const messagingApi = {
  listConversations: () => apiRequest("/conversations"),
  listMessages: (conversationId, params = {}) => {
    const query = new URLSearchParams();
    if (params.cursor) query.set("cursor", params.cursor);
    if (params.limit) query.set("limit", params.limit);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return apiRequest(`/conversations/${conversationId}/messages${suffix}`);
  },
  sendMessage: (conversationId, body) =>
    apiRequest(`/conversations/${conversationId}/messages`, { method: "POST", body: { body } }),
  createDirectConversation: (recipientId) =>
    apiRequest("/direct-conversations", { method: "POST", body: { recipientId } }),
  resolveTeamConversation: (teamId) =>
    apiRequest(`/teams/${teamId}/conversation`),
  listEligibleRecipients: () => apiRequest("/eligible-recipients")
};
