# FusionAI Marketplace

A decentralized platform for registering, listing, and purchasing AI models, built with Next.js, Wagmi, and smart contracts on Ethereum (Sepolia). IPFS is used for decentralized model storage (mocked for now). The platform supports both developers (model creators) and users (model consumers) with a modern, user-centric UI and robust contract integration.

## Features
- Register AI models on-chain with metadata (name, description, IPFS hash)
- List models for sale (Copies or Subscription) with price setting
- Purchase models and gain access (ETH payments, on-chain access control)
- Multi-step upload and listing wizard (drag-and-drop, sale type, price)
- User Dashboard: View purchased models
- Developer Dashboard: View and manage owned models, see listing status and revenue
- Wallet connection (Wagmi, Web3Modal)
- Responsive UI with Tailwind CSS and Shadcn UI
- Mock IPFS upload (real IPFS integration planned)
- **Upgradeable contracts (UUPS proxies) with operator pattern for secure marketplace/registry interaction**
- **Automated ABI copying and contract config sync—frontend/backend always use latest contract addresses/ABIs after deployment**
- **Strict linting and type-checking enforced for all code and scripts**

## Quick Start
1. Clone the repo and install dependencies:
   ```sh
   pnpm install
   ```
2. Copy `.env.example` to `.env.local` and set your environment variables (see contract addresses below).
3. Start the app:
   ```sh
   pnpm dev
   ```
4. Deploy contracts (from `blockchain/`):
   ```sh
   pnpm hardhat run scripts/deploy.ts --network sepolia
   ```
   This will output contract addresses and ABIs to the frontend/backend for seamless integration.

## Contract Addresses (Sepolia)
- **FusionAI_ModelRegistry:** `0x3EAad6984869aCd0000eE0004366D31eD7Cea251`
- **FusionAI_Marketplace:** `0x9638486bcb5d5Af5bC3b513149384e86B35A8678`

## Development Patterns
- Next.js App Router (app/ directory), server components by default
- Wagmi for wallet/blockchain interaction
- React Query for wallet-dependent fetches
- Zod + React Hook Form for all forms
- Multi-step wizard for model upload/listing
- Operator pattern: Marketplace is set as operator in ModelRegistry
- **All code/scripts must pass strict lint/type checks before deploy**

## Roadmap / Next Steps
- Real IPFS integration
- Advanced search/filter for models
- Subscription management features
- Developer analytics
- Multi-network contract config

## Contributing
PRs and issues welcome! Please ensure all code passes lint/type checks and follows the documented architecture and patterns.
