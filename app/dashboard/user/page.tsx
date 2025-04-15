"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { readContracts } from "wagmi/actions";
import { config as wagmiConfig } from "../../../lib/web3modal";
import { sepolia } from "wagmi/chains";
import Link from "next/link";
import modelRegistryAbiJson from "../../../blockchain/abi/FusionAI_ModelRegistry.json";
import marketplaceAbiJson from "../../../blockchain/abi/FusionAI_Marketplace.json";
import { Abi } from 'viem';
import { fetchIPFSMetadata } from '../../../lib/ipfs';

// Type the ABIs explicitly
const modelRegistryAbi = modelRegistryAbiJson as Abi;
const marketplaceAbi = marketplaceAbiJson as Abi;

// Contract addresses
const modelRegistryAddress = "0x3EAad6984869aCd0000eE0004366D31eD7Cea251" as `0x${string}`;
const marketplaceAddress = "0x9638486bcb5d5Af5bC3b513149384e86B35A8678" as `0x${string}`;

interface PurchasedModel {
  id: number;
  name: string;
  ipfsMetadataHash: string;
  owner: string; 
}

export default function UserDashboardPage() {
  const { address, isConnected } = useAccount();
  const [purchasedModels, setPurchasedModels] = useState<PurchasedModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read model count
  const { data: modelCountBigInt } = useReadContract({
    address: modelRegistryAddress,
    abi: modelRegistryAbi,
    functionName: "modelCount",
    chainId: sepolia.id,
  });

  const modelCount = modelCountBigInt !== undefined && modelCountBigInt !== null ? Number(modelCountBigInt) : 0;

  useEffect(() => {
    const fetchPurchasedModels = async () => {
      if (!isConnected || !address || modelCount === 0) {
        setPurchasedModels([]);
        return;
      }

      setIsLoading(true);
      setError(null);
      console.log(`Fetching purchased models for user: ${address}, total models: ${modelCount}`);

      try {
        const modelChecks = [];
        for (let i = 0; i < modelCount; i++) {
          modelChecks.push(
            (async () => {
              try {
                // Fetch model owner and check access in parallel
                const results = await readContracts(wagmiConfig, {
                  contracts: [
                    {
                      address: modelRegistryAddress,
                      abi: modelRegistryAbi,
                      functionName: 'modelInfos',
                      args: [i],
                      chainId: sepolia.id,
                    },
                    {
                      address: marketplaceAddress,
                      abi: marketplaceAbi,
                      functionName: 'hasAccess',
                      args: [address, i],
                      chainId: sepolia.id,
                    }
                  ]
                });

                const modelResult = results[0];
                const accessResult = results[1];

                if (modelResult.status === 'success' && accessResult.status === 'success') {
                  const modelData = modelResult.result as [string, string, bigint, number]; 
                  const hasAccess = accessResult.result as boolean;
                  const owner = modelData[0]; 
                  const ipfsHash = modelData[1]; 
                  
                  // Check if user has access AND is NOT the owner
                  if (hasAccess && owner.toLowerCase() !== address.toLowerCase()) {
                     console.log(`User has purchased access to model ${i}`);
                     // Fetch metadata for name
                     let metadata = { name: `Model ${i}` };
                     try {
                       metadata = await fetchIPFSMetadata(ipfsHash);
                     } catch (ipfsError) {
                       console.error(`Failed to fetch metadata for purchased model ${i}:`, ipfsError);
                     }
                     return { id: i, name: metadata.name, ipfsMetadataHash: ipfsHash, owner: owner };
                  }
                }
              } catch (err) {
                console.error(`Error checking model ${i}:`, err);
              }
              return null;
            })()
          );
        }

        const results = await Promise.all(modelChecks);
        const filteredModels = results.filter(model => model !== null) as PurchasedModel[];
        setPurchasedModels(filteredModels);
        console.log("Purchased models found:", filteredModels);

      } catch (err) { 
        console.error("Error fetching purchased models:", err);
        const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
        setError(`Failed to load purchased models: ${errorMessage}`);
        setPurchasedModels([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPurchasedModels();
  }, [address, isConnected, modelCount]);

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">My Purchased Models</h1>

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
