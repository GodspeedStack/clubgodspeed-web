# Track 001 — UI Rules (Messaging MVP)

## Source of Truth
`README.md` does not define explicit UI rules. Default to the simplest text-first implementation and avoid introducing new UI patterns or components without explicit approval in this track.

## Required Screens
- Messages Inbox
- Conversation View
- New Direct Message
- Team Chat entry point

## Required UI States (per screen)
- Loading
- Empty
- Error
- Populated

## Interaction Rules
- Composer behavior: single-line input, Enter sends.
- Pagination behavior: scrolling up loads older messages; initial load shows most recent page.
- Send flow:
  - Pending state while request is in-flight.
  - Failure state with retry action.

## Accessibility Requirements
- Visible focus styles for all interactive elements.
- Tab order follows visual layout.
- Input and button elements have clear labels for screen readers.
- Keyboard-only operation for conversation navigation and send action.
