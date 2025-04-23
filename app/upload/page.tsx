"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useAccount, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { parseEther, Abi } from "viem";
import Link from "next/link";
import modelRegistryAbiJson from "../../blockchain/artifacts/contracts/FusionAI_ModelRegistry.sol/FusionAI_ModelRegistry.json";
import marketplaceAbiJson from "../../blockchain/abi/FusionAI_Marketplace.json";
import { uploadFilesToIPFS } from "../../lib/ipfs";
import { modelRegistryAddress, marketplaceAddress } from '../config/contracts';
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const modelRegistryAbi = modelRegistryAbiJson.abi as Abi;
const marketplaceAbi = marketplaceAbiJson as Abi;

enum SaleType {
  NotForSale = 0,
  Copies = 1,
  Subscription = 2,
}

const uploadSchema = z.object({
  modelName: z.string().min(3),
  modelDescription: z.string().min(10),
  saleType: z.nativeEnum(SaleType),
  modelPrice: z.string().refine((val) => !isNaN(Number(val)) && Number(val) > 0, {
    message: "Enter a valid price",
  }),
  subscriptionRate: z.string().optional(),
  subscriptionDuration: z.string().optional(),
});

type UploadFormValues = z.infer<typeof uploadSchema>;

const defaultValues: UploadFormValues = {
  modelName: "",
  modelDescription: "",
  saleType: SaleType.Copies,
  modelPrice: "",
  subscriptionRate: "",
  subscriptionDuration: "",
};

export default function UploadPage() {
  const { isConnected, address } = useAccount();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [cid, setCid] = useState<string | null>(null);
  const [modelId, setModelId] = useState<number | null>(null);
  const [uploadStep, setUploadStep] = useState<"upload" | "register" | "list" | "complete">("upload");
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
  } = useForm<UploadFormValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues,
  });

  // Dropzone for file uploads
  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
    setCid(null);
    setUploadProgress(0);
    setUploadStep("upload");
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: false });

  // Upload to IPFS
  const handleUpload = async () => {
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    try {
      const { cid: uploadedCid } = await uploadFilesToIPFS(files, {}, setUploadProgress);
      setCid(uploadedCid);
      setUploadStep("register");
    } catch (e: unknown) {
      console.error(e);
      setError(`Failed to upload file. ${(e instanceof Error ? e.message : "Please try again.")}`);
    } finally {
      setUploading(false);
    }
  };

  // Register model on-chain
  const {
    writeContract: writeRegister,
    isPending: isRegistering,
    error: registerError,
  } = useWriteContract();

  const handleRegister = async (data: UploadFormValues) => {
    if (!cid || !address) return;
    setError(null);
    try {
      writeRegister({
        address: modelRegistryAddress,
        abi: modelRegistryAbi,
        functionName: "registerModel",
        args: [data.modelName, data.modelDescription, cid],
        chainId: sepolia.id,
      });
      setUploadStep("list");
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError("Failed to register model. " + e.message);
      } else {
        setError("Failed to register model.");
      }
    }
  };

  // List model for sale
  const {
    writeContract: writeList,
    isPending: isListing,
    error: listError,
  } = useWriteContract();

  const handleList = async (data: UploadFormValues) => {
    if (!modelId) return;
    setError(null);
    try {
      writeList({
        address: marketplaceAddress,
        abi: marketplaceAbi,
        functionName: "listModel",
        args: [modelId, data.saleType, parseEther(data.modelPrice)],
        chainId: sepolia.id,
      });
      setUploadStep("complete");
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError("Failed to list model. " + e.message);
      } else {
        setError("Failed to list model.");
      }
    }
  };

  // Render upload steps
  const renderUploadStep = () => {
    switch (uploadStep) {
      case "upload":
        return (
          <form
            onSubmit={e => {
              e.preventDefault();
              if (files.length === 0) {
                setError("Please select a file to upload.");
                return;
              }
              handleUpload();
            }}
            className="flex flex-col gap-6"
          >
            <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer ${isDragActive ? "border-indigo-500 bg-indigo-50" : "border-gray-300 bg-gray-50"}`}>
              <input {...getInputProps()} />
              {files.length > 0 ? (
                <span>{files[0].name}</span>
              ) : (
                <span>Drag & drop your model file here, or click to select</span>
              )}
            </div>
            {uploading && (
              <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }} />
              </div>
            )}
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <button
              type="submit"
              className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              disabled={uploading}
            >
              {uploading ? "Uploading..." : "Upload to IPFS"}
            </button>
          </form>
        );
      case "register":
        return (
          <form
            onSubmit={handleSubmit(handleRegister)}
            className="flex flex-col gap-6"
          >
            <input type="hidden" value={cid || ""} readOnly />
            <div>
              <label className="block font-medium mb-1">Model Name</label>
              <input
                {...register("modelName")}
                className="w-full border rounded px-3 py-2"
                placeholder="Enter model name"
              />
              {errors.modelName && <span className="text-red-600 text-sm">{errors.modelName.message}</span>}
            </div>
            <div>
              <label className="block font-medium mb-1">Description</label>
              <textarea
                {...register("modelDescription")}
                className="w-full border rounded px-3 py-2"
                placeholder="Describe your model"
                rows={3}
              />
              {errors.modelDescription && <span className="text-red-600 text-sm">{errors.modelDescription.message}</span>}
            </div>
            <button
              type="submit"
              className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              disabled={isRegistering}
            >
              {isRegistering ? "Registering..." : "Register Model"}
            </button>
            {registerError && <div className="text-red-600 text-sm">{registerError.message}</div>}
            {error && <div className="text-red-600 text-sm">{error}</div>}
          </form>
        );
      case "list":
        return (
          <form
            onSubmit={handleSubmit(handleList)}
            className="flex flex-col gap-6"
          >
            <div>
              <label className="block font-medium mb-1">Sale Type</label>
              <select
                {...register("saleType")}
                className="w-full border rounded px-3 py-2"
              >
                <option value={SaleType.Copies}>Copies</option>
                <option value={SaleType.Subscription}>Subscription</option>
              </select>
              {errors.saleType && <span className="text-red-600 text-sm">{errors.saleType.message}</span>}
            </div>
            <div>
              <label className="block font-medium mb-1">Price (ETH)</label>
              <input
                {...register("modelPrice")}
                className="w-full border rounded px-3 py-2"
                placeholder="Enter price in ETH"
              />
              {errors.modelPrice && <span className="text-red-600 text-sm">{errors.modelPrice.message}</span>}
            </div>
            {watch("saleType") === SaleType.Subscription && (
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block font-medium mb-1">Subscription Rate (ETH)</label>
                  <input
                    {...register("subscriptionRate")}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Rate per period"
                  />
                  {errors.subscriptionRate && <span className="text-red-600 text-sm">{errors.subscriptionRate.message}</span>}
                </div>
                <div className="flex-1">
                  <label className="block font-medium mb-1">Duration (days)</label>
                  <input
                    {...register("subscriptionDuration")}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Duration in days"
                  />
                  {errors.subscriptionDuration && <span className="text-red-600 text-sm">{errors.subscriptionDuration.message}</span>}
                </div>
              </div>
            )}
            <button
              type="submit"
              className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              disabled={isListing}
            >
              {isListing ? "Listing..." : "List Model for Sale"}
            </button>
            {listError && <div className="text-red-600 text-sm">{listError.message}</div>}
            {error && <div className="text-red-600 text-sm">{error}</div>}
          </form>
        );
      case "complete":
        return (
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Success!</h2>
            <p>Your model was successfully listed for sale on the marketplace.</p>
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
                  setCid(null);
                  setModelId(null);
                  reset();
                }}
                className="py-2 px-4 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                Upload Another Model
              </button>
            </div>
          </div>
        );
      default:
        return null;
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
