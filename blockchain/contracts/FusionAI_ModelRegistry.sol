// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FusionAI_ModelRegistry
 * @dev Manages the registration and metadata of AI models on the FusionAI marketplace.
 */
contract FusionAI_ModelRegistry {
    // --- Types ---

    enum SaleType {
        NotForSale,
        Copies,         // Selling limited copies
        Subscription    // Selling time-based access
    }

    struct Model {
        address owner;          // Address of the developer/owner
        string ipfsMetadataHash; // IPFS Content Identifier (CID) for model metadata/files
        uint256 listTimestamp;  // Timestamp when the model was first registered
        SaleType saleType;      // Current sale type for the model
    }

    // --- State Variables ---

    mapping(uint256 => Model) public models;            // modelId => Model details

    /**
     * @dev Returns the Model struct for a given modelId.
     */
    function getModel(uint256 modelId) external view returns (Model memory) {
        return models[modelId];
    }
    mapping(string => bool) public ipfsHashExists;      // ipfsMetadataHash => exists
    uint256 private _modelCounter;                     // Counter for total models registered

    // --- Events ---

    event ModelRegistered(
        uint256 indexed modelId,
        address indexed owner,
        string ipfsMetadataHash,
        SaleType saleType
    );

    event ModelMetadataUpdated(
        uint256 indexed modelId,
        string newIpfsMetadataHash
    );

    event ModelSaleTypeSet(
        uint256 indexed modelId,
        SaleType newSaleType
    );

    // --- Modifiers ---

    modifier onlyModelOwner(uint256 _modelId) {
        require(models[_modelId].owner == msg.sender, "Registry: Caller is not the model owner");
        _;
    }

    // --- Functions ---

    /**
     * @dev Registers a new AI model.
     * @param _ipfsMetadataHash The IPFS hash pointing to the model's metadata and files.
     * @param _saleType The initial sale type for the model.
     * @return modelId The ID of the newly registered model.
     */
    function registerModel(string memory _ipfsMetadataHash, SaleType _saleType) public returns (uint256) {
        require(!ipfsHashExists[_ipfsMetadataHash], "Registry: IPFS hash already registered");
        require(bytes(_ipfsMetadataHash).length > 0, "Registry: IPFS hash cannot be empty");

        uint256 newModelId = _modelCounter; // Get the ID BEFORE incrementing

        models[newModelId] = Model({
            owner: msg.sender,
            ipfsMetadataHash: _ipfsMetadataHash,
            listTimestamp: block.timestamp,
            saleType: _saleType
        });

        ipfsHashExists[_ipfsMetadataHash] = true;
        _modelCounter++; // Increment the counter AFTER using its value

        emit ModelRegistered(newModelId, msg.sender, _ipfsMetadataHash, _saleType);
        return newModelId; // Return the correct ID
    }

    /**
     * @dev Updates the IPFS metadata hash for an existing model.
     *      Only the model owner can call this.
     * @param _modelId The ID of the model to update.
     * @param _newIpfsMetadataHash The new IPFS hash.
     */
    function updateModelMetadata(uint256 _modelId, string memory _newIpfsMetadataHash) public onlyModelOwner(_modelId) {
        require(bytes(_newIpfsMetadataHash).length > 0, "Registry: New IPFS hash cannot be empty");
        // Optional: Check if the new hash is different from the old one
        // require(keccak256(bytes(models[_modelId].ipfsMetadataHash)) != keccak256(bytes(_newIpfsMetadataHash)), "Registry: New hash is same as old");
        // Optional: Prevent re-registering an existing hash to a different model (might be complex/costly)
        // require(!ipfsHashExists[_newIpfsMetadataHash] || keccak256(bytes(models[_modelId].ipfsMetadataHash)) == keccak256(bytes(_newIpfsMetadataHash)), "Registry: New IPFS hash already linked to another model");

        // Update the hash existence tracking if the hash changes
        // If old hash is no longer used by this model, mark it false.
        // If new hash wasn't used before, mark it true.
        // Note: This basic implementation doesn't handle hash collisions perfectly if multiple models could share a hash initially (which registerModel prevents).
        // A more robust system might track hash usage counts.
        if (keccak256(bytes(models[_modelId].ipfsMetadataHash)) != keccak256(bytes(_newIpfsMetadataHash))) {
             ipfsHashExists[models[_modelId].ipfsMetadataHash] = false; // Mark old hash as potentially available
             require(!ipfsHashExists[_newIpfsMetadataHash], "Registry: New IPFS hash already registered by another model");
             ipfsHashExists[_newIpfsMetadataHash] = true; // Mark new hash as used
             models[_modelId].ipfsMetadataHash = _newIpfsMetadataHash;
             emit ModelMetadataUpdated(_modelId, _newIpfsMetadataHash);
        }
    }

    /**
     * @dev Sets the sale type for an existing model.
     *      Only the model owner can call this.
     * @param _modelId The ID of the model to update.
     * @param _saleType The new sale type.
     */
    function setSaleType(uint256 _modelId, SaleType _saleType) public onlyModelOwner(_modelId) {
        // Optional: Check if the new type is different from the old one
        if (models[_modelId].saleType != _saleType) {
            models[_modelId].saleType = _saleType;
            emit ModelSaleTypeSet(_modelId, _saleType);
        }
    }

    /**
     * @dev Returns the current model ID counter.
     */
    function getModelIdCounter() public view returns (uint256) {
        return _modelCounter;
    }

    /**
     * @dev Returns the total number of models registered.
     */
    function modelCount() public view returns (uint256) {
        return _modelCounter;
    }
}
