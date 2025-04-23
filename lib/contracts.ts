import modelRegistry from "../blockchain/abi/FusionAI_ModelRegistryUpgradeable.json";
import marketplace from "../blockchain/abi/FusionAI_MarketplaceUpgradeable.json";

export const modelRegistryAddress = modelRegistry.address as `0x${string}`;
export const marketplaceAddress = marketplace.address as `0x${string}`;
export const modelRegistryAbi = modelRegistry.abi;
export const marketplaceAbi = marketplace.abi;
