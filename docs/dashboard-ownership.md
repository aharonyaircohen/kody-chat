# Dashboard ownership

Kody always has an authenticated user. A connected repository is optional.

| Owner | Data and behavior |
| --- | --- |
| User | Identity, conversations, chat models, AI provider credentials, and personal preferences |
| Repository | Source code, tasks, reports, workflows, Engine configuration, and runtime secrets |

## Rules

- Personal chat must work without GitHub or repository headers.
- Repository context may add repository tools and knowledge to a conversation;
  it must not own the conversation or the user's chat credentials.
- Repository secrets remain scoped to the canonical
  `/repo/:owner/:repo/...` surface and Engine operations.
- API ownership is derived from the authenticated Kody session. A user id sent
  by the browser is never trusted.
- Disconnecting every repository must leave personal chat, conversations, and
  model settings available.
