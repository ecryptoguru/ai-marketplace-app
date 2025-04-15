"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { parseEther, Abi } from "viem";
import Link from "next/link";
import modelRegistryAbiJson from "../../blockchain/artifacts/contracts/FusionAI_ModelRegistry.sol/FusionAI_ModelRegistry.json";
import marketplaceAbiJson from "../../blockchain/abi/FusionAI_Marketplace.json";
import { uploadFilesToIPFS } from "../../lib/ipfs";
import { modelRegistryAddress, marketplaceAddress } from '../config/contracts';

// Type the ABIs explicitly
const modelRegistryAbi = modelRegistryAbiJson.abi as Abi;
const marketplaceAbi = marketplaceAbiJson as Abi;

// Sale types from the contract
enum SaleType {
  NotForSale = 0,
  Copies = 1,
  Subscription = 2
}

export default function UploadPage() {
  const { isConnected, address } = useAccount();
  
  // State for form inputs
  const [modelName, setModelName] = useState("");
  const [modelDescription, setModelDescription] = useState("");
  const [modelPrice, setModelPrice] = useState("");
  const [saleType, setSaleType] = useState<SaleType>(SaleType.Copies);
  const [modelId, setModelId] = useState<number | null>(null);
  const [uploadStep, setUploadStep] = useState<"upload" | "register" | "list" | "complete">("upload");
  
  // State for file uploads
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [cid, setCid] = useState<string | null>(null);
  
  // Contract write hooks
  const { 
    data: registerHash, 
    error: registerError, 
    isPending: isRegisterPending, 
    writeContract: writeRegisterContract 
  } = useWriteContract();
  
  const { 
    data: listHash, 
    error: listError, 
    isPending: isListPending, 
    writeContract: writeListContract 
  } = useWriteContract();
  
  // Transaction receipt hooks
  const { 
    isLoading: isRegisterConfirming, 
    isSuccess: isRegisterConfirmed, 
    error: registerReceiptError 
  } = useWaitForTransactionReceipt({ 
    hash: registerHash,
    chainId: sepolia.id,
  });
  
  const { 
    isLoading: isListConfirming, 
    isSuccess: isListConfirmed, 
    error: listReceiptError 
  } = useWaitForTransactionReceipt({ 
    hash: listHash,
    chainId: sepolia.id,
  });

  // Read the model counter to get the next model ID
  const { data: modelCountBigInt } = useReadContract({
    address: modelRegistryAddress,
    abi: modelRegistryAbi,
    functionName: "modelCounter",
    chainId: sepolia.id,
  });
  
  // File dropzone setup
  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
  }, []);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'application/json': ['.json'],
      'application/octet-stream': ['.bin', '.pt', '.onnx', '.h5'],
      'application/x-python': ['.py'],
      'text/plain': ['.txt', '.md'],
      'application/zip': ['.zip']
    }
  });
  
  // Replace the mock IPFS upload with real Infura IPFS upload
  const uploadToIpfs = async () => {
    if (files.length === 0) {
      alert("Please select files to upload.");
      return;
    }
    
    setUploading(true);
    setUploadProgress(0);
    
    try {
      // Create metadata for the model
      const metadata = {
        name: modelName || "Unnamed Model",
        description: modelDescription || "No description provided",
        creator: address || "Unknown",
      };
      
      // Upload files and metadata to IPFS
      const { metadataCid } = await uploadFilesToIPFS(
        files, 
        metadata,
        (progress) => setUploadProgress(progress)
      );
      
      setCid(metadataCid);
      setUploadStep("register");
      console.log("Uploaded to IPFS with CID:", metadataCid);
    } catch (error) {
      console.error("Failed to upload to IPFS:", error);
      alert("Failed to upload to IPFS. Please try again.");
    } finally {
      setUploading(false);
    }
  };
  
  // Register model in the contract
  const registerModel = async () => {
    if (!cid) {
      alert("Please upload files to IPFS first.");
      return;
    }
    
    try {
      writeRegisterContract({
        address: modelRegistryAddress,
        abi: modelRegistryAbi,
        functionName: "registerModel",
        args: [cid, SaleType.NotForSale], // Initially register as NotForSale
        chainId: sepolia.id,
      });
    } catch (error) {
      console.error("Failed to register model:", error);
      alert("Failed to register model. Please try again.");
    }
  };
  
  // List model for sale
  const listModelForSale = async () => {
    if (modelId === null) {
      alert("Please register the model first.");
      return;
    }
    
    try {
      // First update the sale type in the registry
      await writeListContract({
        address: modelRegistryAddress,
        abi: modelRegistryAbi,
        functionName: "setSaleType",
        args: [modelId, saleType],
        chainId: sepolia.id,
      });
      
      // Then set the price in the marketplace contract
      if (modelPrice) {
        const priceInWei = parseEther(modelPrice);
        
        writeListContract({
          address: marketplaceAddress,
          abi: marketplaceAbi,
          functionName: "listModel",
          args: [modelId, priceInWei],
          chainId: sepolia.id,
        });
      }
    } catch (error) {
      console.error("Failed to list model for sale:", error);
      alert("Failed to list model for sale. Please try again.");
    }
  };
  
  // Handle register confirmation
  useEffect(() => {
    if (isRegisterConfirmed && modelCountBigInt !== undefined) {
      // The model ID will be the current counter value - 1
      // since the counter is incremented after registration
      const newModelId = Number(modelCountBigInt) - 1;
      setModelId(newModelId);
      setUploadStep("list");
    }
  }, [isRegisterConfirmed, modelCountBigInt]);
  
  // Handle list confirmation
  useEffect(() => {
    if (isListConfirmed) {
      setUploadStep("complete");
    }
  }, [isListConfirmed]);
  
  // Render different steps of the process
  const renderUploadStep = () => {
    switch (uploadStep) {
      case "upload":
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Upload Model Files</h2>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="modelName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Model Name
                </label>
                <input
                  type="text"
                  id="modelName"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800"
                  placeholder="Enter model name"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="modelDescription" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  id="modelDescription"
                  value={modelDescription}
                  onChange={(e) => setModelDescription(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800"
                  placeholder="Describe your model"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Model Files
                </label>
                <div 
                  {...getRootProps()} 
                  className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer ${
                    isDragActive ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-300 dark:border-gray-700'
                  }`}
                >
                  <input {...getInputProps()} />
                  {isDragActive ? (
                    <p>Drop the files here ...</p>
                  ) : (
                    <p>Drag and drop model files here, or click to select files</p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Supported formats: .json, .bin, .pt, .onnx, .h5, .py, .txt, .md, .zip
                  </p>
                </div>
              </div>
              
              {files.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2">Selected Files:</h3>
                  <ul className="text-sm space-y-1">
                    {files.map((file, index) => (
                      <li key={index} className="flex items-center">
                        <span className="truncate">{file.name}</span>
                        <span className="ml-2 text-gray-500 dark:text-gray-400">({(file.size / 1024).toFixed(2)} KB)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {uploading && (
                <div className="mt-4">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div 
                      className="bg-indigo-600 h-2.5 rounded-full" 
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm mt-2 text-center">Uploading... {uploadProgress}%</p>
                </div>
              )}
              
              <button
                onClick={uploadToIpfs}
                disabled={!files.length || uploading || !modelName || !modelDescription}
                className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                {uploading ? "Uploading..." : "Upload to IPFS"}
              </button>
            </div>
          </div>
        );
        
      case "register":
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Register Model</h2>
            
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md">
              <h3 className="text-lg font-medium mb-2">IPFS Upload Successful!</h3>
              <p className="mb-2">Your model files have been uploaded to IPFS with the following CID:</p>
              <p className="font-mono text-sm break-all bg-gray-200 dark:bg-gray-700 p-2 rounded">{cid}</p>
            </div>
            
            <p>Next, register your model on the blockchain to make it available in the marketplace.</p>
            
            <button
              onClick={registerModel}
              disabled={isRegisterPending || isRegisterConfirming}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {isRegisterPending ? "Preparing Transaction..." : 
               isRegisterConfirming ? "Confirming Transaction..." : 
               "Register Model"}
            </button>
            
            {registerError && (
              <p className="text-red-500 text-sm mt-2">Error: {registerError.message}</p>
            )}
            
            {registerReceiptError && (
              <p className="text-red-500 text-sm mt-2">Transaction Error: {registerReceiptError.message}</p>
            )}
          </div>
        );
        
      case "list":
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">List Model for Sale</h2>
            
            <div className="bg-green-100 dark:bg-green-900/20 p-4 rounded-md">
              <h3 className="text-lg font-medium mb-2 text-green-800 dark:text-green-300">Model Registered Successfully!</h3>
              <p>Your model has been registered on the blockchain with ID: {modelId}</p>
            </div>
            
            <p>Now, set your pricing details to list the model for sale.</p>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="saleType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Sale Type
                </label>
                <select
                  id="saleType"
                  value={saleType}
                  onChange={(e) => setSaleType(Number(e.target.value) as SaleType)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800"
                >
                  <option value={SaleType.Copies}>Sell Copies</option>
                  <option value={SaleType.Subscription}>Subscription</option>
                </select>
              </div>
              
              <div>
                <label htmlFor="modelPrice" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Price (ETH)
                </label>
                <input
                  type="number"
                  id="modelPrice"
                  value={modelPrice}
                  onChange={(e) => setModelPrice(e.target.value)}
                  step="0.001"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800"
                  placeholder="0.1"
                  required
                />
              </div>
            </div>
            
            <button
              onClick={listModelForSale}
              disabled={isListPending || isListConfirming || !modelPrice}
              className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {isListPending ? "Preparing Transaction..." : 
               isListConfirming ? "Confirming Transaction..." : 
               "List for Sale"}
            </button>
            
            {listError && (
              <p className="text-red-500 text-sm mt-2">Error: {listError.message}</p>
            )}
            
            {listReceiptError && (
              <p className="text-red-500 text-sm mt-2">Transaction Error: {listReceiptError.message}</p>
            )}
          </div>
        );
        
      case "complete":
        return (
          <div className="space-y-6">
            <div className="bg-green-100 dark:bg-green-900/20 p-6 rounded-md text-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-green-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <h2 className="text-2xl font-bold text-green-800 dark:text-green-300 mb-2">Success!</h2>
              <p className="text-green-700 dark:text-green-400 mb-4">Your model has been successfully listed for sale on the marketplace.</p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center mt-6">
                <Link 
                  href="/marketplace"
                  className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  View in Marketplace
                </Link>
                <button
                  onClick={() => {
                    setUploadStep("upload");
                    setFiles([]);
                    setModelName("");
                    setModelDescription("");
                    setModelPrice("");
                    setCid(null);
                    setModelId(null);
                  }}
                  className="py-2 px-4 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                  Upload Another Model
                </button>
              </div>
            </div>
          </div>
        );
    }
  };
  
  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Upload & List AI Model</h1>
      
      {!isConnected ? (
        <div className="bg-yellow-100 dark:bg-yellow-900/20 p-6 rounded-md text-center">
          <p className="text-yellow-800 dark:text-yellow-300 mb-4">Please connect your wallet to upload and list models.</p>
          <p>You can connect your wallet from the home page.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 shadow-md rounded-lg p-6">
          {renderUploadStep()}
        </div>
      )}
    </main>
  );
}
