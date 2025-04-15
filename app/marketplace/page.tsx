"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi"; 
import { readContracts } from "wagmi/actions";
import { config as wagmiConfig } from "../../lib/web3modal";
import { sepolia } from "wagmi/chains";
import Link from "next/link";
import modelRegistryAbiJson from "../../blockchain/artifacts/contracts/FusionAI_ModelRegistry.sol/FusionAI_ModelRegistry.json"; 
import marketplaceAbiJson from "../../blockchain/abi/FusionAI_Marketplace.json"; 
import { Abi } from 'viem'; 
import { fetchIPFSMetadata } from '../../lib/ipfs'; 
import { modelRegistryAddress, marketplaceAddress } from '../config/contracts'; 

// Type the ABIs explicitly
const modelRegistryAbi = modelRegistryAbiJson.abi as Abi;
const marketplaceAbi = marketplaceAbiJson as Abi;

// Define a type for the model data
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

// Sale types from the contract
enum SaleType {
  NotForSale = 0,
  Copies = 1,
  Subscription = 2
}

export default function MarketplacePage() {
  const { isConnected } = useAccount();

  // State for fetched models
  const [registeredModels, setRegisteredModels] = useState<ModelData[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Read model count using the hook
  const {
    data: modelCountBigInt,
    error: readError,
    isLoading: isReading
  } = useReadContract({
    address: modelRegistryAddress,
    abi: modelRegistryAbi,
    functionName: "modelCount",
    chainId: sepolia.id,
    query: { enabled: isConnected } // Fetch only when connected
  });

  const modelCount = modelCountBigInt !== undefined && modelCountBigInt !== null ? Number(modelCountBigInt) : 0;

  // Effect to fetch all models
  useEffect(() => {
    const fetchModels = async () => {
      if (modelCount > 0) {
        setIsLoadingModels(true);
        console.log(`Attempting to fetch ${modelCount} models...`);
        try {
          // Create an array of contracts to call
          const contractsToCall = [];
          for (let i = 0; i < modelCount; i++) {
            contractsToCall.push({
              address: modelRegistryAddress,
              abi: modelRegistryAbi,
              functionName: 'models', // Changed from modelInfos
              args: [BigInt(i + 1)],
              chainId: sepolia.id,
            });
          }

          // Call the contracts
          const modelRegistryResults = await readContracts(wagmiConfig, {
            contracts: contractsToCall,
          });

          // Define the type for the result tuple from the 'models' function
          type ModelResultTuple = readonly [string, string, string, string, bigint];
          const modelDataArray = modelRegistryResults.map((result) => {
            if (result.status === 'success' && result.result) {
              return result.result as ModelResultTuple;
            } else {
              return null;
            }
          });

          // Fetch listing details (isListed, price) from Marketplace contract
          const listingContractsToCall = [];
          for (let i = 0; i < modelCount; i++) {
            listingContractsToCall.push(
              {
                address: marketplaceAddress,
                abi: marketplaceAbi,
                functionName: 'isModelListed',
                args: [i],
                chainId: sepolia.id,
              },
              {
                address: marketplaceAddress,
                abi: marketplaceAbi,
                functionName: 'getModelPrice',
                args: [i],
                chainId: sepolia.id,
              }
            );
          }

          const listingDetailsResults = await readContracts(wagmiConfig, {
            contracts: listingContractsToCall,
          });

          // Combine registry data and listing data, then fetch IPFS metadata
          const combinedModelsPromises = modelDataArray.map(async (modelData, index) => {
            if (modelData) {
              const listingResult = listingDetailsResults[index * 2]; // isModelListed result
              const priceResult = listingDetailsResults[index * 2 + 1]; // getModelPrice result

              const isListed = listingResult.status === 'success' ? (listingResult.result as boolean) : false;
              const price = priceResult.status === 'success' && isListed ? (priceResult.result as bigint) : null;

              const ipfsHash = modelData[3];
              let metadata = { name: 'N/A', description: 'Could not load metadata.' };
              try {
                metadata = await fetchIPFSMetadata(ipfsHash); // Fetch IPFS data here
              } catch (ipfsError) {
                console.error(`Error fetching IPFS metadata for model ${index + 1} (${ipfsHash}):`, ipfsError);
              }

              return {
                id: index + 1, // Model IDs start from 1
                owner: modelData[0],
                name: metadata.name, // Use name from IPFS
                description: metadata.description, // Use description from IPFS
                ipfsMetadataHash: ipfsHash,
                listTimestamp: modelData[4],
                isListed: isListed,
                price: price,
                saleType: 0 // Assuming SaleType needs to be fetched or determined differently now
              };
            } else {
              return null;
            }
          });

          // Wait for all promises (including IPFS fetches) to resolve
          const combinedModels = await Promise.all(combinedModelsPromises);

          // Filter out null results (failed fetches)
          const successfulModels = combinedModels.filter(model => model !== null) as ModelData[];

          setRegisteredModels(successfulModels);
          console.log("Finished fetching all models:", successfulModels);
        } catch (error) {
          console.error("Error in fetchModels batch execution:", error);
          setRegisteredModels([]);
        } finally {
          setIsLoadingModels(false);
        }
      } else {
        setRegisteredModels([]);
      }
    };

    fetchModels();
  }, [modelCount, isConnected]);

  // Helper function to format price
  const formatPrice = (price: bigint | null): string => {
    if (price === null) return "Not for sale";
    return `${Number(price) / 1e18} ETH`;
  };

  // Helper function to get sale type label
  const getSaleTypeLabel = (saleType: number): string => {
    switch (saleType) {
      case SaleType.NotForSale:
        return "Not For Sale";
      case SaleType.Copies:
        return "Copies";
      case SaleType.Subscription:
        return "Subscription";
      default:
        return "Unknown";
    }
  };

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">AI Model Marketplace</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        {/* Registry Information */}
        <div className="bg-white dark:bg-zinc-900 shadow-md rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Registry Information</h2>
          {isReading && <p>Loading model count...</p>}
          {readError && (
            <p className="text-red-500">
              Error fetching model count: {readError.message}
            </p>
          )}
          {!isReading && modelCount !== undefined && modelCount !== null && (
            <p>
              Total Models Registered:{" "}
              <span className="font-mono">{modelCount.toString()}</span>
            </p>
          )}
          {!isReading && (modelCount === undefined || modelCount === null) && !readError && (
            <p>Could not fetch model count.</p>
          )}
        </div>

        {/* Quick Links */}
        <div className="bg-white dark:bg-zinc-900 shadow-md rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Links</h2>
          <div className="space-y-2">
            <Link 
              href="/upload" 
              className="block w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md text-center"
            >
              Upload & List New Model
            </Link>
            {isConnected ? (
              <Link 
                href="#my-models" 
                className="block w-full py-2 px-4 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium rounded-md text-center"
              >
                View My Models
              </Link>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 text-center">
                Connect your wallet to view your models
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Display Registered Models Section */}
      <div className="mt-12">
        <h2 className="text-2xl font-semibold mb-6">Registered Models</h2>
        {isLoadingModels && <p>Loading models...</p>}
        {!isLoadingModels && registeredModels.length === 0 && (
          <p>No models found or registered yet.</p>
        )}
        
        {!isLoadingModels && registeredModels.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {registeredModels.map((model) => (
              <Link key={model.id} href={`/model/${model.id}`} passHref>
                <div className="bg-white dark:bg-zinc-900 shadow-md rounded-lg p-6 cursor-pointer hover:shadow-lg transition-shadow duration-200 flex flex-col justify-between h-full">
                  <div>
                    <h3 className="text-xl font-semibold mb-2 truncate" title={model.name || 'Model ' + model.id}>
                      {model.name || `Model ${model.id}`}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-3 h-16 overflow-hidden text-ellipsis" title={model.description || 'No description available.'}>
                       {model.description || 'No description available.'}
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
