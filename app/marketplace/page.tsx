"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import Link from "next/link";
import modelRegistryAbiJson from "../../blockchain/artifacts/contracts/FusionAI_ModelRegistry.sol/FusionAI_ModelRegistry.json";
import marketplaceAbiJson from "../../blockchain/abi/FusionAI_Marketplace.json";
import { Abi } from "viem";
import { fetchIPFSMetadata } from "../../lib/ipfs";
import { modelRegistryAddress, marketplaceAddress } from "../config/contracts";
import { readContract } from "@wagmi/core";
import { config as wagmiConfig } from "../../lib/web3modal";

const modelRegistryAbi = modelRegistryAbiJson.abi as Abi;
const marketplaceAbi = marketplaceAbiJson as Abi;

interface ModelData {
  id: number;
  owner: string;
  ipfsMetadataHash: string;
  listTimestamp: bigint;
  saleType: number;
  price: bigint | null;
  isListed: boolean;
  name?: string;
  description?: string;
}

enum SaleType {
  NotForSale = 0,
  Copies = 1,
  Subscription = 2,
}

function getSaleTypeLabel(saleType: number): string {
  switch (saleType) {
    case SaleType.Copies:
      return "Copies";
    case SaleType.Subscription:
      return "Subscription";
    default:
      return "Not For Sale";
  }
}

function formatPrice(price: bigint | null): string {
  if (!price || price === 0n) return "Free";
  // Convert wei to ETH
  return `${Number(price) / 1e18} ETH`;
}

export default function MarketplacePage() {
  const { isConnected } = useAccount();
  const [registeredModels, setRegisteredModels] = useState<ModelData[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Read model count
  const {
    data: modelCountBigInt,
    isLoading: isReading,
  } = useReadContract({
    address: modelRegistryAddress,
    abi: modelRegistryAbi,
    functionName: "modelCount",
    chainId: sepolia.id,
    query: { enabled: isConnected },
  });

  const modelCount = modelCountBigInt !== undefined && modelCountBigInt !== null ? Number(modelCountBigInt) : 0;

  useEffect(() => {
    const fetchModels = async () => {
      setFetchError(null);
      setRegisteredModels([]);
      if (!isConnected || modelCount === 0) return;
      setIsLoadingModels(true);
      try {
        const models: ModelData[] = [];
        for (let i = 0; i < modelCount; i++) {
          // Fetch model details from contract
          const modelResult = await readContract(wagmiConfig, {
            address: modelRegistryAddress,
            abi: modelRegistryAbi,
            functionName: "getModel",
            args: [i],
            chainId: sepolia.id,
          });
          if (!modelResult) continue;
          const [owner, ipfsMetadataHash, listTimestamp, saleType] = modelResult as [string, string, bigint, number];
          const isListed = await readContract(wagmiConfig, {
            address: marketplaceAddress,
            abi: marketplaceAbi,
            functionName: "isModelListed",
            args: [i],
            chainId: sepolia.id,
          });
          const price = await readContract(wagmiConfig, {
            address: marketplaceAddress,
            abi: marketplaceAbi,
            functionName: "getModelPrice",
            args: [i],
            chainId: sepolia.id,
          });
          let name: string | undefined = undefined;
          let description: string | undefined = undefined;
          try {
            const metadata = await fetchIPFSMetadata(ipfsMetadataHash);
            name = metadata?.name;
            description = metadata?.description;
          } catch {}
          models.push({
            id: i,
            owner: owner as string,
            ipfsMetadataHash: ipfsMetadataHash as string,
            listTimestamp: listTimestamp as bigint,
            saleType: saleType as number,
            price: typeof price === 'bigint' ? price : null,
            isListed: Boolean(isListed),
            name,
            description,
          });
        }
        setRegisteredModels(models);
      } catch (err: unknown) {
        setFetchError("Failed to fetch models. " + (err instanceof Error ? err.message : ""));
      } finally {
        setIsLoadingModels(false);
      }
    };
    fetchModels();
  }, [isConnected, modelCount]);

  return (
    <main className="container mx-auto px-4 py-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-8">Marketplace</h1>
      <div className="mb-6 flex justify-end">
        <Link
          href="/upload"
          className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          + Upload New Model
        </Link>
      </div>
      <div>
        {isReading || isLoadingModels ? (
          <p>Loading models...</p>
        ) : fetchError ? (
          <p className="text-red-600">{fetchError}</p>
        ) : registeredModels.length === 0 ? (
          <p>No models found or registered yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {registeredModels.map((model) => (
              <Link key={model.id} href={`/model/${model.id}`} passHref>
                <div className="bg-white dark:bg-zinc-900 shadow-md rounded-lg p-6 cursor-pointer hover:shadow-lg transition-shadow duration-200 flex flex-col justify-between h-full">
                  <div>
                    <h3
                      className="text-xl font-semibold mb-2 truncate"
                      title={model.name || "Model " + model.id}
                    >
                      {model.name || `Model ${model.id}`}
                    </h3>
                    <p
                      className="text-gray-600 dark:text-gray-400 text-sm mb-3 h-16 overflow-hidden text-ellipsis"
                      title={model.description || "No description available."}
                    >
                      {model.description || "No description available."}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 truncate" title={model.owner}>
                      Owner: {model.owner}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 truncate" title={model.ipfsMetadataHash}>
                      Metadata Hash: {model.ipfsMetadataHash}
                    </p>
                  </div>
                  <div className="mt-auto pt-4 border-t border-gray-200 dark:border-gray-700">
                    <p className="font-semibold mb-1">
                      {model.isListed ? formatPrice(model.price) : "Not Listed"}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Sale Type: {getSaleTypeLabel(model.saleType)}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
