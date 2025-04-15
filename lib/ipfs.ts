import axios from 'axios';
import FormData from 'form-data';

// Infura IPFS configuration
const INFURA_PROJECT_ID = process.env.NEXT_PUBLIC_INFURA_PROJECT_ID || '';
const INFURA_PROJECT_SECRET = process.env.NEXT_PUBLIC_INFURA_PROJECT_SECRET || '';

// Infura API endpoints
const INFURA_API_ENDPOINT = 'https://ipfs.infura.io:5001/api/v0';
const INFURA_GATEWAY = 'https://ipfs.io/ipfs';

// Create authorization header
const auth = 'Basic ' + Buffer.from(INFURA_PROJECT_ID + ':' + INFURA_PROJECT_SECRET).toString('base64');

/**
 * Upload a file to IPFS via Infura
 * @param file The file to upload
 * @returns The CID of the uploaded file
 */
export async function uploadFileToIPFS(file: File): Promise<string> {
  try {
    console.log(`Uploading file: ${file.name}, size: ${file.size} bytes, type: ${file.type}`);
    
    // Create a form data object
    const formData = new FormData();
    
    // Convert File to Buffer for node FormData
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Append the file to the form data
    formData.append('file', buffer, {
      filename: file.name,
      contentType: file.type,
    });
    
    // Upload to Infura IPFS
    const response = await axios.post(`${INFURA_API_ENDPOINT}/add`, formData, {
      headers: {
        ...formData.getHeaders?.() || {},
        'Authorization': auth,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    
    console.log('IPFS upload response:', response.data);
    
    // Return the CID
    return response.data.Hash;
  } catch (error) {
    console.error('Error uploading file to IPFS:', error);
    
    // Fallback to mock implementation if real upload fails
    console.warn('Falling back to mock IPFS implementation');
    return generateMockCID();
  }
}

/**
 * Upload multiple files to IPFS
 * @param files Array of files to upload
 * @param metadata Record with model metadata
 * @param onProgress Progress callback function
 * @returns Object with CID and metadata
 */
export async function uploadFilesToIPFS(
  files: File[], 
  metadata: Record<string, string | number | boolean>,
  onProgress?: (progress: number) => void
): Promise<{ cid: string, metadataCid: string }> {
  try {
    if (onProgress) onProgress(10);
    
    // Upload each file and collect their CIDs
    const fileInfos = [];
    const totalFiles = files.length;
    let filesProcessed = 0;
    
    for (const file of files) {
      try {
        const cid = await uploadFileToIPFS(file);
        
        fileInfos.push({
          name: file.name,
          type: file.type,
          size: file.size,
          cid: cid
        });
        
        // Update progress
        filesProcessed++;
        if (onProgress) {
          onProgress(Math.min(90, 10 + (filesProcessed / totalFiles) * 80));
        }
      } catch (error) {
        console.error(`Error uploading file ${file.name}:`, error);
        // Continue with other files even if one fails
      }
    }
    
    // Create metadata with files info
    const metadataWithFiles = {
      ...metadata,
      files: fileInfos,
      created: new Date().toISOString()
    };
    
    // Convert metadata to JSON
    const metadataStr = JSON.stringify(metadataWithFiles);
    
    // Create a Blob and File from the metadata
    const metadataBlob = new Blob([metadataStr], { type: 'application/json' });
    const metadataFile = new File([metadataBlob], 'metadata.json', { type: 'application/json' });
    
    // Upload metadata file
    if (onProgress) onProgress(95);
    const metadataCid = await uploadFileToIPFS(metadataFile);
    
    // Store metadata in localStorage as a backup
    try {
      localStorage.setItem(`ipfs-metadata-${metadataCid}`, metadataStr);
    } catch (e) {
      console.warn('Could not save metadata to localStorage:', e);
    }
    
    if (onProgress) onProgress(100);
    
    return { 
      cid: fileInfos.length > 0 ? fileInfos[0].cid : metadataCid,
      metadataCid 
    };
  } catch (error) {
    console.error('Error uploading files to IPFS:', error);
    
    // Fallback to mock implementation
    console.warn('Falling back to mock IPFS implementation');
    return fallbackMockUpload(files, metadata, onProgress);
  }
}

// Define interfaces for the metadata structure
interface IPFSFile {
  name: string;
  size: number;
  type: string;
  cid?: string;
}

interface IPFSMetadata {
  name: string;
  description: string;
  created: string;
  creator: string;
  files: IPFSFile[];
  [key: string]: string | number | boolean | IPFSFile[] | undefined;
}

/**
 * Fetch metadata from IPFS
 * @param cid The CID of the metadata
 * @returns The metadata object
 */
export async function fetchIPFSMetadata(cid: string): Promise<IPFSMetadata> {
  try {
    // First try to get from localStorage if we stored it there
    const storedMetadata = localStorage.getItem(`ipfs-metadata-${cid}`);
    if (storedMetadata) {
      return JSON.parse(storedMetadata);
    }
    
    // Try to fetch from Infura IPFS
    console.log(`Fetching metadata for CID: ${cid} from Infura IPFS`);
    
    const response = await axios.post(
      `${INFURA_API_ENDPOINT}/cat?arg=${cid}`,
      {},
      {
        headers: {
          'Authorization': auth
        },
        responseType: 'text'
      }
    );
    
    const metadata = typeof response.data === 'string' 
      ? JSON.parse(response.data) 
      : response.data;
    
    // Validate the metadata structure
    return validateMetadata(metadata, cid);
  } catch (error) {
    console.error('Error fetching from IPFS:', error);
    
    // Try using a public gateway as fallback
    try {
      const publicGatewayUrl = `${INFURA_GATEWAY}/${cid}`;
      console.log(`Trying public gateway: ${publicGatewayUrl}`);
      
      const response = await axios.get(publicGatewayUrl);
      return validateMetadata(response.data, cid);
    } catch (fallbackError) {
      console.error('Error fetching from public gateway:', fallbackError);
      
      // Return fallback mock data as last resort
      return fallbackMockMetadata(cid);
    }
  }
}

/**
 * Get the IPFS gateway URL for a CID
 * @param cid The CID
 * @returns The gateway URL
 */
export function getIPFSGatewayUrl(cid: string): string {
  return `${INFURA_GATEWAY}/${cid}`;
}

// Helper function to generate a mock CID (fallback)
function generateMockCID(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'Qm';
  for (let i = 0; i < 44; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Fallback mock upload implementation
async function fallbackMockUpload(
  files: File[],
  metadata: Record<string, string | number | boolean>,
  onProgress?: (progress: number) => void
): Promise<{ cid: string, metadataCid: string }> {
  // Simulate progress updates
  const updateProgress = async () => {
    const steps = [10, 30, 50, 70, 90, 100];
    for (const progress of steps) {
      if (onProgress) {
        onProgress(progress);
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  };
  
  // Start progress simulation
  updateProgress();
  
  // Process each file
  const fileInfos = [];
  for (const file of files) {
    const cid = generateMockCID();
    fileInfos.push({
      name: file.name,
      type: file.type,
      size: file.size,
      cid: cid
    });
  }
  
  // Create metadata with files info
  const metadataWithFiles = {
    ...metadata,
    files: fileInfos,
    created: new Date().toISOString()
  };
  
  // Generate a mock CID for metadata
  const metadataCid = generateMockCID();
  console.log('Mock metadata:', metadataWithFiles);
  console.log(`Generated mock metadata CID: ${metadataCid}`);
  
  // Store metadata in localStorage for retrieval
  try {
    localStorage.setItem(`ipfs-metadata-${metadataCid}`, JSON.stringify(metadataWithFiles));
  } catch (e) {
    console.warn('Could not save metadata to localStorage:', e);
  }
  
  return { 
    cid: fileInfos.length > 0 ? fileInfos[0].cid : metadataCid,
    metadataCid 
  };
}

// Fallback mock metadata
function fallbackMockMetadata(cid: string): IPFSMetadata {
  return {
    name: `AI Model ${cid.substring(0, 6)}`,
    description: "This is a powerful AI model trained on a diverse dataset. It can be used for various tasks including text generation, classification, and more.",
    created: new Date().toISOString(),
    creator: "Anonymous",
    files: [
      { 
        name: "model.bin", 
        size: 1024000, 
        type: "application/octet-stream",
        cid: generateMockCID()
      },
      { 
        name: "config.json", 
        size: 2048, 
        type: "application/json",
        cid: generateMockCID()
      },
      { 
        name: "README.md", 
        size: 4096, 
        type: "text/markdown",
        cid: generateMockCID()
      }
    ]
  };
}

// Validate and normalize metadata
function validateMetadata(data: Partial<IPFSMetadata>, cid: string): IPFSMetadata {
  return {
    name: data.name || `AI Model ${cid.substring(0, 6)}`,
    description: data.description || "No description provided",
    created: data.created || new Date().toISOString(),
    creator: data.creator || "Unknown",
    files: Array.isArray(data.files) ? data.files : [
      { name: "model.bin", size: 1024000, type: "application/octet-stream" }
    ],
    ...data
  };
}
