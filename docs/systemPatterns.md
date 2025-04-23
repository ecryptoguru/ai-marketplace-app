# System Patterns

## Architecture
- Next.js App Router (app/ directory), server components by default
- Wagmi for wallet and blockchain interaction
- React Query for client-side data fetching and cache
- UI built with Tailwind CSS and Shadcn UI primitives
- Smart contracts (ModelRegistry & Marketplace) deployed on-chain
- Mock IPFS integration for uploads

## Key Technical Decisions
- Server components for data fetch, client components for interactivity
- React Query for wallet-dependent fetches
- Zod + React Hook Form for all forms
- All DB logic (if any) to be in `src/lib/prisma.ts` (future)

## Design Patterns
- Multi-step wizard for model upload/listing
- Conditional navigation based on wallet connection
- Model card and dashboard patterns for user/developer separation
