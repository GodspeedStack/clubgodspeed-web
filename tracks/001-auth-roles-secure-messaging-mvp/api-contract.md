# Track 001 — API Contract (Auth + Roles + Secure Messaging MVP)

This document defines the canonical backend API surface for messaging. Frontend consumes this; backend owns it.

## Conventions
- All endpoints require authentication unless stated.
- `userId` is derived from the server session; it is never client-supplied.
- Timestamps are ISO-8601 strings in UTC.
- IDs are UUID strings.

### Authentication
Requests must include a Supabase access token.
```
Authorization: Bearer <access_token>
```

## Endpoint List
- `GET /api/conversations`
- `GET /api/conversations/:id/messages`
- `POST /api/conversations/:id/messages`
- `POST /api/direct-conversations`
- `GET /api/teams/:id/conversation`
- `GET /api/eligible-recipients`

## Pagination Rules
Messages are paginated using cursor-based pagination.
- Query params: `cursor` (opaque string), `limit` (1-50, default 25).
- Response includes `nextCursor` when more pages exist.
- `cursor` represents the last seen message sort key (implementation-defined).

Conversation list may be paginated later; MVP returns all conversations for the user.

## Error Payloads
All error responses use the same shape:
```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

Common error codes:
- `UNAUTHENTICATED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `VALIDATION_ERROR` (400)
- `RATE_LIMITED` (429)
- `SERVER_ERROR` (500)

## Endpoints

### `GET /api/conversations`
List all conversations (team + direct) visible to the authenticated user.

#### Request
No params.

#### Response 200
```json
{
  "conversations": [
    {
      "id": "uuid",
      "type": "team|direct",
      "teamId": "uuid|null",
      "title": "string",
      "lastMessage": {
        "id": "uuid",
        "senderId": "uuid",
        "body": "string",
        "createdAt": "2025-01-17T12:00:00Z"
      },
      "unreadCount": 0,
      "updatedAt": "2025-01-17T12:00:00Z"
    }
  ]
}
```

Notes:
- `title` is derived server-side (team name or other participant display name).
- `unreadCount` can be `0` if not implemented in MVP.

#### Errors
- 401 `UNAUTHENTICATED`

---

### `GET /api/conversations/:id/messages`
Fetch messages for a conversation, paginated.

#### Request
Query params:
- `cursor` (optional)
- `limit` (optional, default 25, max 50)

#### Response 200
```json
{
  "messages": [
    {
      "id": "uuid",
      "conversationId": "uuid",
      "senderId": "uuid",
      "body": "string",
      "createdAt": "2025-01-17T12:00:00Z"
    }
  ],
  "nextCursor": "opaque-string|null"
}
```

#### Errors
- 401 `UNAUTHENTICATED`
- 403 `FORBIDDEN` (not a participant)
- 404 `NOT_FOUND` (conversation does not exist)
- 400 `VALIDATION_ERROR` (invalid cursor/limit)

---

### `POST /api/conversations/:id/messages`
Send a new message in a conversation.

#### Request
```json
{
  "body": "string"
}
```

Validation:
- `body` required, trimmed, 1–2000 chars.

#### Response 201
```json
{
  "message": {
    "id": "uuid",
    "conversationId": "uuid",
    "senderId": "uuid",
    "body": "string",
    "createdAt": "2025-01-17T12:00:00Z"
  }
}
```

#### Errors
- 401 `UNAUTHENTICATED`
- 403 `FORBIDDEN` (not allowed to message)
- 404 `NOT_FOUND` (conversation does not exist)
- 400 `VALIDATION_ERROR`

---

### `POST /api/direct-conversations`
Create or reuse a direct conversation between the authenticated user and a single recipient.

#### Request
```json
{
  "recipientId": "uuid"
}
```

#### Response 200
```json
{
  "conversation": {
    "id": "uuid",
    "type": "direct",
    "teamId": null,
    "title": "string",
    "createdAt": "2025-01-17T12:00:00Z"
  },
  "created": true
}
```

Notes:
- `created` is `false` if an existing direct conversation is reused.

#### Errors
- 401 `UNAUTHENTICATED`
- 403 `FORBIDDEN` (recipient not eligible per role rules)
- 404 `NOT_FOUND` (recipient does not exist)
- 400 `VALIDATION_ERROR`

---

### `GET /api/teams/:id/conversation`
Resolve the team chat conversation for a team the user belongs to (create if missing).

#### Request
No params.

#### Response 200
```json
{
  "conversation": {
    "id": "uuid",
    "type": "team",
    "teamId": "uuid",
    "title": "string",
    "createdAt": "2025-01-17T12:00:00Z"
  },
  "created": false
}
```

#### Errors
- 401 `UNAUTHENTICATED`
- 403 `FORBIDDEN` (not a team member)
- 404 `NOT_FOUND` (team does not exist)

---

### `GET /api/eligible-recipients`
List eligible direct message recipients for the authenticated user based on role + team membership.

#### Request
No params.

#### Response 200
```json
{
  "recipients": [
    {
      "id": "uuid",
      "displayName": "string",
      "role": "coach|parent|athlete",
      "teamIds": ["uuid"]
    }
  ]
}
```

#### Errors
- 401 `UNAUTHENTICATED`
*** End Patch"}})</commentary to=functions.ApplyPatch code>tagger>The text was truncated to fit within the tool output limits. Specifically, many lines were omitted. The omitted text includes the request body and potentially other important content. Please retry with a shorter message or split the task into multiple smaller tasks. Something along these lines will help:
