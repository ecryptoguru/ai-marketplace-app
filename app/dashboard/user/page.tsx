"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { readContracts } from '@wagmi/core';
import { config as wagmiConfig } from "../../../lib/web3modal";
import { sepolia } from "wagmi/chains";
import Link from "next/link";
import modelRegistryAbiJson from "../../../blockchain/artifacts/contracts/FusionAI_ModelRegistry.sol/FusionAI_ModelRegistry.json";
import marketplaceAbiJson from "../../../blockchain/abi/FusionAI_Marketplace.json";
import { Abi } from 'viem';
import { modelRegistryAddress, marketplaceAddress } from '../../config/contracts';

// Type the ABIs explicitly
const modelRegistryAbi = modelRegistryAbiJson.abi as Abi;
const marketplaceAbi = marketplaceAbiJson as Abi;

interface PurchasedModel {
  id: number;
  name: string;
  ipfsMetadataHash: string;
  owner: string; 
}

interface SubscriptionModel {
  id: number;
  name: string;
  ipfsMetadataHash: string;
}

// Define the structure for contract calls used with readContracts
type ContractReadCall = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args?: unknown[];
  chainId?: number;
};

function isSuccessResult<T>(res: unknown): res is { status: 'success'; result: T } {
  return (
    typeof res === 'object' &&
    res !== null &&
    'status' in res &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (res as any).status === 'success' &&
    'result' in res
  );
}

export default function UserDashboardPage() {
  const { address, isConnected } = useAccount();
  const [purchasedModels, setPurchasedModels] = useState<PurchasedModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSubscriptions, setActiveSubscriptions] = useState<SubscriptionModel[]>([]);

  // Read total model count using the hook
  const { data: modelCountData } = useReadContract({
    address: modelRegistryAddress,
    abi: modelRegistryAbi,
    functionName: "modelCount",
    chainId: sepolia.id,
    // Query only when connected
    query: { enabled: isConnected },
  });
  const totalModelCount = modelCountData ? Number(modelCountData) : 0;

  useEffect(() => {
    const fetchPurchasedModels = async () => {
      if (!isConnected || !address || totalModelCount === 0) {
        setPurchasedModels([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const modelDetailsContracts: ContractReadCall[] = [];

      try {
        // First, get all model IDs the user has access to
        const accessCheckContracts = Array.from({ length: totalModelCount }, (_, i) => ({
          address: marketplaceAddress,
          abi: marketplaceAbi,
          functionName: 'hasAccess',
          args: [BigInt(i + 1), address],
          chainId: sepolia.id,
        }));

        const accessResults = await readContracts(wagmiConfig, { contracts: accessCheckContracts });

        // Filter model IDs where user has access
        const accessibleModelIds = accessResults
          .map((res, i) => (isSuccessResult<boolean>(res) && res.result ? i + 1 : null))
          .filter((id): id is number => id !== null);

        // Now, fetch details ONLY for accessible models
        for (const modelId of accessibleModelIds) {
          modelDetailsContracts.push({
            address: modelRegistryAddress,
            abi: modelRegistryAbi,
            functionName: 'models',
            args: [BigInt(modelId)],
            chainId: sepolia.id,
          });
        }

        if (modelDetailsContracts.length === 0) {
          setPurchasedModels([]);
          setIsLoading(false);
          return; // No accessible models to fetch details for
        }

        const modelDetailsResults = await readContracts(wagmiConfig, { contracts: modelDetailsContracts });

        // Filter out nulls (errors or models the user owns)
        const validPurchasedModels = modelDetailsResults
          .map((res, idx) => {
            if (!isSuccessResult<[string, string, string, string]>(res) || !Array.isArray(res.result)) return null;
            const [, name, , ipfsMetadataHash] = res.result;
            const modelId = accessibleModelIds[idx];
            return {
              id: modelId,
              name: name,
              ipfsMetadataHash: ipfsMetadataHash,
              owner: '',
            };
          })
          .filter((model): model is PurchasedModel => model !== null);

        setPurchasedModels(validPurchasedModels);
      } catch (error) {
        console.error("Error fetching purchased models:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        setError(`Failed to load purchased models: ${errorMessage}`);
        setPurchasedModels([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPurchasedModels();
  }, [address, isConnected, totalModelCount]);

  useEffect(() => {
    async function fetchSubscriptions() {
      if (!isConnected || !address) return;
      try {
        // Fetch all models, check for active subscriptions
        const subscriptionModels: SubscriptionModel[] = [];
        for (let i = 0; i < totalModelCount; i++) {
          const modelResult = await readContracts(wagmiConfig, { contracts: [{
            address: modelRegistryAddress,
            abi: modelRegistryAbi,
            functionName: "models",
            args: [i],
            chainId: sepolia.id,
          }] });
          if (!Array.isArray(modelResult) || !isSuccessResult<[string, string, string, string, bigint]>(modelResult[0]) || !Array.isArray(modelResult[0].result)) continue;
          const [, name, ipfsMetadataHash, , saleType] = modelResult[0].result;
          if (Number(saleType) === 2) {
            // Check subscription status
            const subscriptionResult = await readContracts(wagmiConfig, { contracts: [{
              address: marketplaceAddress,
              abi: marketplaceAbi,
              functionName: "checkSubscription",
              args: [i, address],
              chainId: sepolia.id,
            }] });
            if (Array.isArray(subscriptionResult) && isSuccessResult<boolean>(subscriptionResult[0]) && Boolean(subscriptionResult[0].result)) {
              subscriptionModels.push({ id: i, name, ipfsMetadataHash });
            }
          }
        }
        setActiveSubscriptions(subscriptionModels);
      } catch {
        // fail silently for now
      }
    }
    fetchSubscriptions();
  }, [isConnected, address, totalModelCount]);

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">My Purchased Models</h1>

      {activeSubscriptions.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Active Subscriptions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeSubscriptions.map((sub) => (
              <div key={sub.id} className="bg-white dark:bg-zinc-900 shadow-md rounded-lg p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-semibold mb-2 truncate" title={sub.name}>{sub.name}</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500 break-all mb-2">Metadata Hash: {sub.ipfsMetadataHash}</p>
                  <Link href={`/model/${sub.id}`} className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm">View Model</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isConnected ? (
        <div className="bg-yellow-100 dark:bg-yellow-900/20 p-6 rounded-lg text-center">
          <p className="text-yellow-800 dark:text-yellow-300">Please connect your wallet to view your purchased models.</p>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center items-center min-h-[20vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          <p className="ml-4 text-gray-600 dark:text-gray-400">Loading purchased models...</p>
        </div>
      ) : error ? (
        <div className="bg-red-100 dark:bg-red-900/20 p-6 rounded-lg text-center">
          <p className="text-red-700 dark:text-red-400">{error}</p>
        </div>
      ) : purchasedModels.length === 0 ? (
        <div className="bg-blue-100 dark:bg-blue-900/20 p-6 rounded-lg text-center">
          <p className="text-blue-700 dark:text-blue-300">You haven&apos;t purchased any models yet.</p>
          <Link href="/marketplace" className="mt-4 inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md">
            Browse Marketplace
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {purchasedModels.map((model) => (
            <Link key={model.id} href={`/model/${model.id}`} passHref>
              <div className="bg-white dark:bg-zinc-900 shadow-md rounded-lg p-6 cursor-pointer hover:shadow-lg transition-shadow duration-200">
                <h3 className="text-xl font-semibold mb-2 truncate" title={model.name}>
                  {model.name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Model ID: {model.id}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate" title={model.owner}>
                  Owner: {model.owner.slice(0, 6)}...{model.owner.slice(-4)}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 break-all">
                  Metadata Hash: {model.ipfsMetadataHash}
                </p>
                <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 text-right">
                  <span className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">View Details &rarr;</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
