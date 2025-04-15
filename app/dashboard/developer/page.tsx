"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { readContract } from "wagmi/actions";
import { config as wagmiConfig } from "../../../lib/web3modal";
import { sepolia } from "wagmi/chains";
import Link from "next/link";
import modelRegistryAbiJson from "../../../blockchain/artifacts/contracts/FusionAI_ModelRegistry.sol/FusionAI_ModelRegistry.json";
import marketplaceAbiJson from "../../../blockchain/abi/FusionAI_Marketplace.json";
import { Abi, formatEther } from 'viem';
import { fetchIPFSMetadata } from '../../../lib/ipfs';
import { modelRegistryAddress, marketplaceAddress } from '../../config/contracts';

// Type the ABIs explicitly
const modelRegistryAbi = modelRegistryAbiJson.abi as Abi;
const marketplaceAbi = marketplaceAbiJson as Abi;

interface OwnedModel {
  id: number;
  name: string;
  ipfsMetadataHash: string;
  isListed: boolean;
  price: bigint | null;
}

export default function DeveloperDashboardPage() {
  const { address, isConnected } = useAccount();
  const [ownedModels, setOwnedModels] = useState<OwnedModel[]>([]);
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
    const fetchOwnedModels = async () => {
      if (!isConnected || !address || modelCount === 0) {
        setOwnedModels([]);
        return;
      }

      setIsLoading(true);
      setError(null);
      console.log(`Fetching owned models for developer: ${address}, total models: ${modelCount}`);

      try {
        const modelPromises = [];
        
        // First, get all model IDs and filter for owned ones
        for (let i = 0; i < modelCount; i++) {
          modelPromises.push((async (modelId) => {
            try {
              // Use individual readContract calls instead of batched calls
              const modelData = await readContract(wagmiConfig, {
                address: modelRegistryAddress,
                abi: modelRegistryAbi,
                functionName: 'models', // Changed from modelInfos
                args: [modelId],
                chainId: sepolia.id,
              });
              
              console.log(`Model ${modelId} data:`, modelData);
              
              // Extract owner and ipfsHash based on the structure of the returned data
              let owner, ipfsHash;
              
              if (Array.isArray(modelData)) {
                owner = modelData[0];
                ipfsHash = modelData[1];
              } else if (modelData && typeof modelData === 'object') {
                const modelObj = modelData as Record<string, unknown>;
                owner = modelObj.owner as string;
                ipfsHash = (modelObj.ipfsMetadataHash || modelObj.cid || modelObj.ipfsHash) as string;
              } else {
                console.error(`Unexpected model data format for model ${modelId}:`, modelData);
                return null;
              }
              
              if (!owner || !ipfsHash) {
                console.error(`Missing owner or ipfsHash for model ${modelId}`);
                return null;
              }
              
              console.log(`Model ${modelId} - Owner: ${owner}, Connected: ${address}`);
              
              // Check if the connected user is the owner
              if (owner.toLowerCase() === address.toLowerCase()) {
                console.log(`User owns model ${modelId}`);
                
                // Get listing status
                let isListed = false;
                let price: bigint | null = null;
                
                try {
                  isListed = await readContract(wagmiConfig, {
                    address: marketplaceAddress,
                    abi: marketplaceAbi,
                    functionName: 'isModelListed',
                    args: [modelId],
                    chainId: sepolia.id,
                  }) as boolean;
                  
                  if (isListed) {
                    price = await readContract(wagmiConfig, {
                      address: marketplaceAddress,
                      abi: marketplaceAbi,
                      functionName: 'getModelPrice',
                      args: [modelId],
                      chainId: sepolia.id,
                    }) as bigint;
                  }
                } catch (marketplaceErr) {
                  console.error(`Error fetching marketplace data for model ${modelId}:`, marketplaceErr);
                }
                
                // Get metadata
                let name = `Model ${modelId}`;
                try {
                  const metadata = await fetchIPFSMetadata(ipfsHash);
                  name = metadata.name || name;
                } catch (ipfsErr) {
                  console.error(`Error fetching IPFS metadata for model ${modelId}:`, ipfsErr);
                }
                
                return {
                  id: modelId,
                  name,
                  ipfsMetadataHash: ipfsHash,
                  isListed,
                  price
                };
              }
            } catch (err) {
              console.error(`Error processing model ${modelId}:`, err);
            }
            return null;
          })(i));
        }
        
        const results = await Promise.all(modelPromises);
        const filteredModels = results.filter(model => model !== null) as OwnedModel[];
        
        console.log("Owned models found:", filteredModels);
        setOwnedModels(filteredModels);
      } catch (err) { 
        console.error("Error fetching owned models:", err);
        const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
        setError(`Failed to load owned models: ${errorMessage}`);
        setOwnedModels([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOwnedModels();
  }, [address, isConnected, modelCount]);

  // Helper function to format price
  const formatPrice = (price: bigint | null): string => {
    if (price === null || !price) return "Not Set";
    return `${formatEther(price)} ETH`;
  };

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">My Developer Dashboard</h1>

      {!isConnected ? (
        <div className="bg-yellow-100 dark:bg-yellow-900/20 p-6 rounded-lg text-center">
          <p className="text-yellow-800 dark:text-yellow-300">Please connect your wallet to view your developer dashboard.</p>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center items-center min-h-[20vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          <p className="ml-4 text-gray-600 dark:text-gray-400">Loading your models...</p>
        </div>
      ) : error ? (
        <div className="bg-red-100 dark:bg-red-900/20 p-6 rounded-lg text-center">
          <p className="text-red-700 dark:text-red-400">{error}</p>
        </div>
      ) : ownedModels.length === 0 ? (
        <div className="bg-blue-100 dark:bg-blue-900/20 p-6 rounded-lg text-center">
          <p className="text-blue-700 dark:text-blue-300">You haven&apos;t registered any models yet.</p>
          <Link href="/upload" className="mt-4 inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md">
            Upload a Model
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ownedModels.map((model) => (
            <div key={model.id} className="bg-white dark:bg-zinc-900 shadow-md rounded-lg p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-xl font-semibold mb-2 truncate" title={model.name}>
                  {model.name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Model ID: {model.id}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 break-all mb-4">
                   Metadata Hash: {model.ipfsMetadataHash}
                </p>
                <div className="space-y-1 text-sm mb-4">
                    <p>Status: <span className={`font-medium ${model.isListed ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>{model.isListed ? 'Listed' : 'Not Listed'}</span></p>
                    <p>Price: <span className="font-medium text-gray-800 dark:text-gray-200">{formatPrice(model.price)}</span></p>
                </div>
              </div>
              <div className="mt-auto pt-4 border-t border-gray-200 dark:border-gray-700">
                <Link href={`/model/${model.id}`} passHref>
                  <span className="text-indigo-600 dark:text-indigo-400 hover:underline text-sm">View Details</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
