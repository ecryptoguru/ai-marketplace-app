"use client";

import { useState, useEffect } from "react";
import { useParams } from 'next/navigation';
import Link from "next/link";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { readContracts } from '@wagmi/core';
import { config as wagmiConfig } from "../../../lib/web3modal";
import { sepolia } from "wagmi/chains";
import modelRegistryAbiJson from "../../../blockchain/artifacts/contracts/FusionAI_ModelRegistry.sol/FusionAI_ModelRegistry.json"; 
import marketplaceAbiJson from "../../../blockchain/abi/FusionAI_Marketplace.json"; 
import { Abi, formatEther, parseEther } from 'viem';
import { fetchIPFSMetadata, getIPFSGatewayUrl } from '../../../lib/ipfs';
import { modelRegistryAddress, marketplaceAddress } from '../../config/contracts'; 
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { SubmitHandler } from "react-hook-form";

// Type the ABIs explicitly
const modelRegistryAbi = modelRegistryAbiJson.abi as Abi; 
const marketplaceAbi = marketplaceAbiJson as Abi; 

// Sale types from the contract
enum SaleType {
  NotForSale = 0,
  Copies = 1,
  Subscription = 2
}

// IPFS Metadata Structure
interface FileInfo {
  name: string;
  size: number;
  type: string;
  cid?: string;
}

interface IpfsMetadata {
  name: string;
  description: string;
  created: string;
  creator: string;
  files: Array<FileInfo>;
}

// Type definition for model data
interface ModelData {
  id: number;
  owner: string;
  ipfsMetadataHash: string;
  listTimestamp: bigint;
  saleType: number;
  isListed: boolean;
  price: bigint | null;
}

// Real function to fetch IPFS metadata
async function fetchModelMetadata(cid: string): Promise<IpfsMetadata> {
  try {
    // Fetch metadata from IPFS
    const metadata = await fetchIPFSMetadata(cid);
    
    // Ensure the metadata matches our expected format
    const validatedMetadata: IpfsMetadata = {
      name: metadata.name || `AI Model ${cid.substring(0, 6)}`,
      description: metadata.description || "No description provided",
      created: metadata.created || new Date().toISOString(),
      creator: metadata.creator || "Unknown",
      files: Array.isArray(metadata.files) ? metadata.files : [
        { name: "model.bin", size: 1024000, type: "application/octet-stream" }
      ]
    };
    
    return validatedMetadata;
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error fetching IPFS metadata:", error.message);
    } else {
      console.error("Error fetching IPFS metadata:", String(error));
    }
    console.error("Error fetching IPFS metadata:", error);
    
    // Return fallback data if fetch fails
    return {
      name: `AI Model ${cid.substring(0, 6)}`,
      description: "Failed to load model description from IPFS.",
      created: new Date().toISOString(),
      creator: "Unknown",
      files: [
        { name: "model.bin", size: 1024000, type: "application/octet-stream" }
      ]
    };
  }
}

// Type guard for contract results
function isSuccessResult<T>(res: unknown): res is { status: 'success'; result: T } {
  return (
    typeof res === 'object' &&
    res !== null &&
    'status' in res &&
    (res as any).status === 'success' // eslint-disable-line @typescript-eslint/no-explicit-any
    && 'result' in (res as any) // eslint-disable-line @typescript-eslint/no-explicit-any
  );
}

export default function ModelDetailPage() {
  const params = useParams();
  const { isConnected, address } = useAccount();
  const modelId = Number(params.modelId);

  // State for model data
  const [isLoading, setIsLoading] = useState(true);
  const [model, setModel] = useState<ModelData | null>(null);
  const [metadata, setMetadata] = useState<IpfsMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [canPurchase, setCanPurchase] = useState(false);

  // Contract write hooks for purchase
  const { 
    data: purchaseHash, 
    error: purchaseError, 
    isPending: isPurchasePending, 
    writeContract: writePurchaseContract 
  } = useWriteContract();

  // Transaction receipt hook
  const { 
    isLoading: isPurchaseConfirming, 
    isSuccess: isPurchaseConfirmed, 
    error: purchaseReceiptError 
  } = useWaitForTransactionReceipt({ 
    hash: purchaseHash,
    chainId: sepolia.id,
  });

  // Transaction status
  interface TransactionStatus {
    status: "idle" | "pending" | "processing" | "success" | "error";
    message: string;
    hash: string;
  }
  
  const [transactionStatus, setTransactionStatus] = useState<TransactionStatus>({
    status: "idle",
    message: "",
    hash: ""
  });

  // Subscription state
  const [subscriptionStatus, setSubscriptionStatus] = useState<'active' | 'expired' | 'none' | 'checking'>('checking');
  const [subscribeLoading, setSubscribeLoading] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  const subscribeSchema = z.object({
    months: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
      message: "Enter a valid number of months",
    }),
  });
  const defaultSubscribeValues = { months: "1" };
  const {
    register: registerSubscribe,
    handleSubmit: handleSubscribeSubmit,
    formState: { errors: subscribeErrors },
  } = useForm({
    resolver: zodResolver(subscribeSchema),
    defaultValues: defaultSubscribeValues,
  });

  // Handle transaction status updates
  useEffect(() => {
    if (isPurchasePending) {
      setTransactionStatus({
        status: "pending",
        message: "Transaction pending...",
        hash: ""
      });
    } else if (purchaseError) {
      setTransactionStatus({
        status: "error",
        message: `Transaction failed: ${purchaseError ? (purchaseError as Error).message : "Unknown error"}`,
        hash: ""
      });
    } else if (purchaseHash && isPurchaseConfirming) {
      setTransactionStatus({
        status: "processing",
        message: "Transaction sent! Waiting for confirmation...",
        hash: purchaseHash
      });
    } else if (purchaseHash && !isPurchaseConfirming && !isPurchaseConfirmed) {
      setTransactionStatus({
        status: "processing",
        message: "Transaction sent! Waiting for confirmation...",
        hash: purchaseHash
      });
    }
  }, [isPurchasePending, isPurchaseConfirming, isPurchaseConfirmed, purchaseError, purchaseHash]);

  // Fetch model data
  useEffect(() => {
    const fetchModelData = async () => {
      if (isNaN(modelId)) {
        setError("Invalid model ID");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        
        // Fetch model details from registry
        const modelResult = await readContracts(wagmiConfig, { contracts: [{
          address: modelRegistryAddress,
          abi: modelRegistryAbi,
          functionName: 'models',
          args: [BigInt(modelId)],
          chainId: sepolia.id
        }] });
        
        if (!Array.isArray(modelResult) || !isSuccessResult(modelResult[0])) {
          setError("Failed to fetch model data");
          setIsLoading(false);
          return;
        }
        
        const modelData = modelResult[0].result as [string, string, string, string, number];
        const [, , ipfsMetadataHash, , saleType] = modelData;
        
        // Fetch additional marketplace data
        const marketplaceData = await readContracts(wagmiConfig, { contracts: [
          {
            address: marketplaceAddress,
            abi: marketplaceAbi,
            functionName: 'isModelListed',
            args: [BigInt(modelId)],
            chainId: sepolia.id
          },
          {
            address: marketplaceAddress,
            abi: marketplaceAbi,
            functionName: 'getModelPrice',
            args: [BigInt(modelId)],
            chainId: sepolia.id
          }
        ] });
        
        if (!Array.isArray(marketplaceData) || !isSuccessResult(marketplaceData[0]) || !isSuccessResult(marketplaceData[1])) {
          setError("Failed to fetch marketplace data");
          setIsLoading(false);
          return;
        }
        
        const isListed = marketplaceData[0].result as boolean;
        const price = marketplaceData[1].result as bigint | null;
        
        // Check if user has access
        if (isConnected && address) {
          const accessResult = await readContracts(wagmiConfig, { contracts: [
            {
              address: marketplaceAddress,
              abi: marketplaceAbi,
              functionName: 'hasAccess',
              args: [BigInt(modelId), address],
              chainId: sepolia.id
            },
            {
              address: modelRegistryAddress,
              abi: modelRegistryAbi,
              functionName: 'ownerOf',
              args: [BigInt(modelId)],
              chainId: sepolia.id
            },
          ] });
          
          if (!Array.isArray(accessResult) || !isSuccessResult(accessResult[0]) || !isSuccessResult(accessResult[1])) {
            setError("Failed to fetch access data");
            setIsLoading(false);
            return;
          }
          
          const hasModelAccess = accessResult[0].result as boolean;
          const isOwner = accessResult[1].result === address;
          setHasAccess(hasModelAccess || isOwner);
        }
        
        // Combine all data
        const fullModelData: ModelData = {
          id: modelId,
          owner: modelData[0],
          ipfsMetadataHash,
          listTimestamp: BigInt(0), // Not available in the provided data
          saleType,
          isListed,
          price
        };
        
        setModel(fullModelData);
        
        // Fetch metadata from IPFS
        const ipfsMetadata = await fetchModelMetadata(fullModelData.ipfsMetadataHash);
        setMetadata(ipfsMetadata);
        
        setIsLoading(false);
        
        // Determine user relationship to model
        const isOwner = isConnected && address && address.toLowerCase() === fullModelData.owner.toLowerCase();
        const hasModelAccess = hasAccess || (isConnected && isOwner);
        
        // If user is not the owner and doesn't have access and the model is listed, they can purchase
        setCanPurchase(isConnected && !isOwner && !hasModelAccess && isListed);
      } catch (error) {
        if (error instanceof Error) {
          setError(error.message);
        } else {
          setError(String(error));
        }
        if (error instanceof Error) {
          setError(error.message);
        } else {
          setError(String(error));
        }
        setIsLoading(false);
      }
    };

    fetchModelData();
  }, [modelId, isConnected, address, hasAccess]);

  // Handle purchase confirmation
  useEffect(() => {
    if (purchaseHash && isPurchaseConfirmed) {
      setTransactionStatus({
        status: "success",
        message: "Purchase successful! You now have access to this model.",
        hash: purchaseHash
      });
      
      // Update access status
      setHasAccess(true);
    }
  }, [purchaseHash, isPurchaseConfirmed]);

  // Handle transaction error
  useEffect(() => {
    if (purchaseError) {
      setTransactionStatus({
        status: "error",
        message: `Transaction failed: ${(purchaseError as Error).message || "Unknown error"}`,
        hash: ""
      });
    }
  }, [purchaseError]);

  // Handle transaction receipt error
  useEffect(() => {
    if (purchaseReceiptError) {
      setTransactionStatus({
        status: "error",
        message: `Transaction confirmation failed: ${(purchaseReceiptError as Error).message || "Unknown error"}`,
        hash: purchaseHash || ""
      });
    }
  }, [purchaseReceiptError, purchaseHash]);

  // Check subscription status
  useEffect(() => {
    async function checkSub() {
      setSubscriptionStatus('checking');
      if (!address || !modelId || model?.saleType !== SaleType.Subscription) {
        setSubscriptionStatus('none');
        return;
      }
      try {
        const result = await readContracts(wagmiConfig, { contracts: [
          {
            address: marketplaceAddress,
            abi: marketplaceAbi,
            functionName: 'checkSubscription',
            args: [modelId, address],
            chainId: sepolia.id
          }
        ] });
        if (!Array.isArray(result) || !isSuccessResult(result[0])) {
          setSubscriptionStatus('none');
          return;
        }
        setSubscriptionStatus((result[0].result as 'active' | 'expired'));
      } catch (error) {
        if (error instanceof Error) {
          setSubscriptionStatus('none');
          console.error(error.message);
        } else {
          setSubscriptionStatus('none');
          console.error(String(error));
        }
        setSubscriptionStatus('none');
      }
    }
    checkSub();
  }, [address, modelId, model]);

  // Purchase model
  const purchaseModel = async () => {
    if (!model || !isConnected || !model.price) return; 
    
    try {
      writePurchaseContract({
        address: marketplaceAddress,
        abi: marketplaceAbi,
        functionName: "purchaseModel",
        args: [BigInt(modelId)],
        value: model.price, 
        chainId: sepolia.id,
      });
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error(String(error));
      }
      console.error("Failed to purchase model");
    }
  };

  // Subscribe to model
  const onSubscribe: SubmitHandler<{ months: string }> = async (data) => {
    const months = Number(data.months);
    setSubscribeLoading(true);
    setSubscribeError(null);
    try {
      await writePurchaseContract({
        address: marketplaceAddress,
        abi: marketplaceAbi,
        functionName: 'subscribe',
        args: [modelId, months],
        chainId: sepolia.id,
        value: parseEther(months.toString()),
      });
      setSubscribeLoading(false);
      setSubscriptionStatus('active');
    } catch (e: unknown) {
      if (e && typeof e === "object" && "message" in e) {
        setSubscribeError((e as { message: string }).message);
      } else {
        setSubscribeError("Unknown error");
      }
      setSubscribeLoading(false);
    }
  };

  // Helper function to format price
  const formatPrice = (price: bigint | null): string => {
    if (price === null) return "Not for sale";
    return `${formatEther(price)} ETH`;
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

  // Render loading state
  if (isLoading) {
    return (
      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
        </div>
      </main>
    );
  }

  // Render error state
  if (error || !model) {
    return (
      <main className="container mx-auto px-4 py-8">
        <div className="bg-red-100 dark:bg-red-900/20 p-6 rounded-lg text-center">
          <h2 className="text-xl font-semibold text-red-800 dark:text-red-300 mb-2">Error</h2>
          <p className="text-red-700 dark:text-red-400">{error || "Failed to load model data"}</p>
          <Link 
            href="/marketplace" 
            className="mt-4 inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md"
          >
            Back to Marketplace
          </Link>
        </div>
      </main>
    );
  }

  const isOwner = isConnected && address && address.toLowerCase() === model.owner.toLowerCase();

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link 
          href="/marketplace" 
          className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L7.414 9H15a1 1 0 110 2H7.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
          Back to Marketplace
        </Link>
      </div>

      <div className="bg-white dark:bg-zinc-900 shadow-md rounded-lg overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold mb-1">{metadata?.name || `Model #${model.id}`}</h1>
              <p className="text-gray-600 dark:text-gray-400">
                ID: {model.id} • Listed: {new Date(Number(model.listTimestamp) * 1000).toLocaleDateString()}
              </p>
            </div>
            <div className="flex flex-col items-end">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                model.isListed 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' 
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
              }`}>
                {model.isListed ? 'Listed for Sale' : 'Not Listed'}
              </span>
              {hasAccess && (
                <span className="mt-2 px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 rounded-full text-sm font-medium">
                  You have access
                </span>
              )}
              {isOwner && (
                <span className="mt-2 px-3 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300 rounded-full text-sm font-medium">
                  You are the owner
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Left column - Model details */}
            <div className="md:col-span-2 space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-3">Description</h2>
                <p className="text-gray-700 dark:text-gray-300">
                  {metadata?.description || "No description available"}
                </p>
              </div>

              {metadata?.files && metadata.files.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold mb-3">Files</h2>
                  <ul className="space-y-2 bg-gray-50 dark:bg-zinc-800 p-4 rounded-md">
                    {metadata.files.map((file: FileInfo, index: number) => (
                      <li key={index} className="flex justify-between items-center">
                        <div className="flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span>{file.name}</span>
                        </div>
                        <div className="flex items-center">
                          <span className="text-sm text-gray-500 mr-4">{(file.size / 1024).toFixed(1)} KB</span>
                          {hasAccess && file.cid && (
                            <a 
                              href={getIPFSGatewayUrl(file.cid)} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                            >
                              Download
                            </a>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h2 className="text-xl font-semibold mb-3">IPFS Details</h2>
                <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-md">
                  <p className="mb-2">
                    <span className="font-medium">IPFS Hash:</span>{" "}
                    <a 
                      href={`https://ipfs.io/ipfs/${model.ipfsMetadataHash}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="font-mono text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      {model.ipfsMetadataHash}
                    </a>
                  </p>
                  <p>
                    <span className="font-medium">Created:</span>{" "}
                    <span>{metadata?.created ? new Date(metadata.created).toLocaleString() : "Unknown"}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Right column - Purchase info */}
            <div className="space-y-6">
              <div className="bg-gray-50 dark:bg-zinc-800 p-6 rounded-lg">
                <h2 className="text-xl font-semibold mb-4">Purchase Information</h2>
                
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Sale Type:</span>
                    <span className="font-medium">{getSaleTypeLabel(model.saleType)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Price:</span>
                    <span className="font-medium text-lg">{formatPrice(model.price)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Owner:</span>
                    <a 
                      href={`https://sepolia.etherscan.io/address/${model.owner}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-indigo-600 hover:underline"
                    >
                      {model.owner.slice(0, 6)}...{model.owner.slice(-4)}
                    </a>
                  </div>
                </div>
                
                {!isConnected ? (
                  <div className="bg-yellow-100 dark:bg-yellow-900/20 p-4 rounded-md text-center mb-4">
                    <p className="text-yellow-800 dark:text-yellow-300 mb-2">Connect your wallet to purchase</p>
                  </div>
                ) : hasAccess ? (
                  <div className="bg-green-100 dark:bg-green-900/20 p-4 rounded-md mb-4">
                    <h4 className="text-lg font-semibold text-green-800 dark:text-green-300 mb-3">Access Model Content</h4>
                    {metadata?.files && metadata.files.length > 0 ? (
                      <ul className="space-y-2">
                        {metadata.files.map((file, index) => (
                          <li key={index} className="text-sm">
                            {file.cid ? (
                              <a 
                                href={getIPFSGatewayUrl(file.cid)} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline break-all"
                              >
                                {file.name || `File ${index + 1}`}
                              </a>
                            ) : (
                              <span className="text-gray-600 dark:text-gray-400">
                                {file.name || `File ${index + 1}`} (CID not available)
                              </span>
                            )}
                            <span className="text-gray-500 dark:text-gray-500 text-xs ml-2">({file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Size unknown'})</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-gray-600 dark:text-gray-400 text-sm">No specific model files listed in metadata.</p>
                    )}
                  </div>
                ) : isOwner ? (
                  <div className="bg-purple-100 dark:bg-purple-900/20 p-4 rounded-md text-center mb-4">
                    <p className="text-purple-800 dark:text-purple-300">You are the owner of this model</p>
                  </div>
                ) : model.saleType === SaleType.NotForSale ? (
                  <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md text-center mb-4">
                    <p className="text-gray-700 dark:text-gray-300">This model is not for sale</p>
                  </div>
                ) : model.saleType === SaleType.Subscription ? (
                  <div className="mt-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-md">
                    <h3 className="text-lg font-semibold mb-2 text-indigo-900 dark:text-indigo-200">Subscription Model</h3>
                    {subscriptionStatus === 'active' ? (
                      <div className="text-green-700 dark:text-green-300">You have an active subscription.</div>
                    ) : (
                      <form onSubmit={handleSubscribeSubmit(onSubscribe)} className="mt-2 flex flex-col gap-2">
                        <label htmlFor="months" className="text-sm">Months to subscribe:</label>
                        <input type="number" id="months" {...registerSubscribe("months")} min="1" className="w-32 px-2 py-1 rounded border" />
                        {subscribeErrors.months && (
                          <div className="text-red-500 text-xs">{subscribeErrors.months.message}</div>
                        )}
                        <button type="submit" disabled={subscribeLoading} className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                          {subscribeLoading ? "Subscribing..." : "Subscribe"}
                        </button>
                        {subscribeError && <div className="text-red-500 text-xs">{subscribeError}</div>}
                      </form>
                    )}
                  </div>
                ) : canPurchase ? (
                  <div>
                    <button
                      className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      onClick={purchaseModel}
                      disabled={!isConnected || isPurchasePending || transactionStatus.status === "processing"}
                    >
                      {isPurchasePending || transactionStatus.status === "processing" ? (
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </span>
                      ) : (
                        `Purchase for ${model.price ? formatEther(model.price) : "0"} ETH`
                      )}
                    </button>
                    
                    {/* Transaction Status Messages */}
                    {transactionStatus.status === "pending" && (
                      <p className="mt-2 text-sm text-yellow-600">
                        {transactionStatus.message}
                      </p>
                    )}
                    
                    {transactionStatus.status === "processing" && (
                      <p className="mt-2 text-sm text-blue-600">
                        {transactionStatus.message}
                        {transactionStatus.hash && (
                          <a 
                            href={`https://sepolia.etherscan.io/tx/${transactionStatus.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 underline"
                          >
                            View on Etherscan
                          </a>
                        )}
                      </p>
                    )}
                    
                    {transactionStatus.status === "success" && (
                      <p className="mt-2 text-sm text-green-600">
                        {transactionStatus.message}
                        {transactionStatus.hash && (
                          <a 
                            href={`https://sepolia.etherscan.io/tx/${transactionStatus.hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 underline"
                          >
                            View on Etherscan
                          </a>
                        )}
                      </p>
                    )}
                    
                    {transactionStatus.status === "error" && (
                      <p className="mt-2 text-sm text-red-600">
                        {transactionStatus.message}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md text-center mb-4">
                    <p className="text-gray-700 dark:text-gray-300">You are not eligible to purchase this model</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
