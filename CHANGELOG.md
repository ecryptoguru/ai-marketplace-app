# Changelog

## [Unreleased]
### Added
- Model registration, listing, and purchase flows (stable)
- User Dashboard (purchased models) and Developer Dashboard (owned models, listing status, revenue)
- Multi-step upload/listing wizard with drag-and-drop, sale type, price
- Wallet connection (Wagmi, Web3Modal), navigation with conditional links
- Mock IPFS upload (real IPFS integration planned)
- Upgradeable ModelRegistry and Marketplace contracts (UUPS proxy pattern)
- Operator pattern: Marketplace can act on behalf of model owners
- Automated ABI copying and contract config sync for frontend/backend after deployment
- Responsive UI with Tailwind CSS and Shadcn UI
- Purchase flow with transaction status and Etherscan links

### Changed
- Navigation improved with conditional dashboard links based on wallet connection
- UI responsiveness and user-centric flows improved
- All contract calls now use strict types and robust type guards
- Automated contract config and ABI sync is now enforced after deployment
- Deployment scripts set Marketplace as operator and output addresses/ABIs for dApp integration

### Fixed
- All TypeScript and lint errors resolved; codebase is strictly typed and production-ready
- Integration bugs due to outdated contract addresses/ABIs eliminated
- Smart contract tests pass after operator upgrade

### Known Issues
- Mock IPFS is a temporary solution (real IPFS integration pending)
- No subscription management yet

### Next
- Real IPFS integration
- Advanced search/filter for models
- Subscription management features
- Developer analytics
- Multi-network contract config
