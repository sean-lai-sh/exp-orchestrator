# Authentication & Project Persistence

## Architecture

- **Auth**: [better-auth](https://better-auth.com/) with email/password, running inside Convex via `@convex-dev/better-auth`
- **Database**: [Convex](https://convex.dev/) for both auth tables and application data (projects, workflows)
- **No separate SQL database** — everything lives in Convex

## Data Model

### Projects
Each user has zero or more projects. A project is a named container for a workflow.

### Workflows
Each project has one workflow document storing the full React Flow state (nodes and edges) as JSON strings.

## Auth Flow

1. User signs up or signs in at `/login` or `/signup`
2. `better-auth` creates a session, synced into Convex's auth system via the `convex` plugin
3. All Convex queries/mutations verify the user's identity via `ctx.auth.getUserIdentity()`
4. Next.js middleware redirects unauthenticated users to `/login`

## Environment Setup

### 1. Install & init Convex
```bash
cd frontend
npm install
npx convex dev   # Interactive — creates .env.local with CONVEX_DEPLOYMENT and NEXT_PUBLIC_CONVEX_URL
```

### 2. Set Convex environment variables
```bash
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set SITE_URL http://localhost:3000
```

### 3. Add to `.env.local`
```
NEXT_PUBLIC_CONVEX_SITE_URL=https://<your-deployment>.convex.site
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 4. Run dev servers
```bash
npx convex dev    # Terminal 1
npm run dev       # Terminal 2
```

## Auto-Save

When editing a workflow with a project loaded (`/create?project=<id>`), changes are auto-saved to Convex after a 2-second debounce. Pending saves are flushed on unmount (e.g., navigating away).

## Ephemeral Mode

Visiting `/create` without a `?project=` parameter works in ephemeral mode — no persistence, same as the original behavior.

## Adding OAuth Providers

To add GitHub, Google, or other OAuth providers later, update `convex/auth.ts`:

```typescript
import { github } from "better-auth/social-providers";

// In createAuth:
socialProviders: {
  github: github({ clientId: "...", clientSecret: "..." }),
},
```

Then add the corresponding client-side sign-in button using `authClient.signIn.social({ provider: "github" })`.
