// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title FusionAI_ModelRegistryUpgradeable
 * @dev UUPS Upgradeable version of the model registry with operator support
 */
contract FusionAI_ModelRegistryUpgradeable is Initializable, OwnableUpgradeable, UUPSUpgradeable {
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

    mapping(uint256 => Model) public models;
    mapping(string => bool) public ipfsHashExists;
    uint256 private _modelCounter;

    // --- Operator Support ---
    mapping(address => bool) public operators;
    event OperatorSet(address indexed operator, bool approved);

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

    modifier onlyModelOwner(uint256 _modelId) {
        require(models[_modelId].owner == msg.sender, "Registry: Caller is not the model owner");
        _;
    }
    modifier onlyModelOwnerOrOperator(uint256 _modelId) {
        require(
            models[_modelId].owner == msg.sender || operators[msg.sender],
            "Registry: Caller is not the model owner or approved operator"
        );
        _;
    }

    function initialize(address initialOwner) public initializer {
        __Ownable_init(initialOwner);
        __UUPSUpgradeable_init();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // --- Operator Management ---
    function setOperator(address operator, bool approved) external onlyOwner {
        operators[operator] = approved;
        emit OperatorSet(operator, approved);
    }

    function registerModel(string memory _ipfsMetadataHash, SaleType _saleType) public returns (uint256) {
        require(!ipfsHashExists[_ipfsMetadataHash], "Registry: IPFS hash already registered");
        uint256 modelId = _modelCounter;
        models[modelId] = Model({
            owner: msg.sender,
            ipfsMetadataHash: _ipfsMetadataHash,
            listTimestamp: block.timestamp,
            saleType: _saleType
        });
        ipfsHashExists[_ipfsMetadataHash] = true;
        _modelCounter++;
        emit ModelRegistered(modelId, msg.sender, _ipfsMetadataHash, _saleType);
        return modelId;
    }

    function updateModelMetadata(uint256 _modelId, string memory _newIpfsMetadataHash) public onlyModelOwnerOrOperator(_modelId) {
        require(!ipfsHashExists[_newIpfsMetadataHash], "Registry: New IPFS hash already registered by another model");
        ipfsHashExists[models[_modelId].ipfsMetadataHash] = false;
        ipfsHashExists[_newIpfsMetadataHash] = true;
        models[_modelId].ipfsMetadataHash = _newIpfsMetadataHash;
        emit ModelMetadataUpdated(_modelId, _newIpfsMetadataHash);
    }

    function setSaleType(uint256 _modelId, SaleType _saleType) public onlyModelOwnerOrOperator(_modelId) {
        if (models[_modelId].saleType != _saleType) {
            models[_modelId].saleType = _saleType;
            emit ModelSaleTypeSet(_modelId, _saleType);
        }
    }

    function getModel(uint256 modelId) external view returns (Model memory) {
        return models[modelId];
    }
    function getModelIdCounter() public view returns (uint256) {
        return _modelCounter;
    }
    function modelCount() public view returns (uint256) {
        return _modelCounter;
    }
}
