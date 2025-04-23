// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./FusionAI_ModelRegistryUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/**
 * @title FusionAI_MarketplaceUpgradeable
 * @dev UUPS Upgradeable version of the marketplace
 */
contract FusionAI_MarketplaceUpgradeable is Initializable, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    FusionAI_ModelRegistryUpgradeable public registry;
    address public platformFeeWallet;
    uint256 public platformFeePercent;

    struct CopySale {
        uint256 price;
        uint256 totalCopies;
        uint256 soldCopies;
    }
    mapping(uint256 => CopySale) public copySales;

    struct Subscription {
        uint256 rate;
        uint32 durationSeconds;
    }
    mapping(uint256 => Subscription) public subscriptions;
    mapping(uint256 => mapping(address => uint256)) public userSubscriptions;

    event ItemListedForCopies(uint256 indexed modelId, address indexed owner, uint256 price, uint256 totalCopies);
    event ItemPurchased(uint256 indexed modelId, address indexed buyer, uint256 price, address seller, address platformWallet, uint256 platformFee);
    event PlatformFeesWithdrawn(address indexed owner, uint256 amount);
    event ItemListedForSubscription(uint256 indexed modelId, address indexed owner, uint256 rate, uint32 durationSeconds);
    event Subscribed(uint256 indexed modelId, address indexed subscriber, uint256 expiryTimestamp);

    error Marketplace_InvalidModelId();
    error Marketplace_NotModelOwner();
    error Marketplace_InvalidPrice();
    error Marketplace_InvalidTotalCopies();
    error Marketplace_AlreadyListedForCopies();
    error Marketplace_NotListedForCopies();
    error Marketplace_IncorrectPayment();
    error Marketplace_SoldOut();
    error Marketplace_TransferFailed();
    error Marketplace_InvalidFeePercent();
    error Marketplace_ZeroAddress();
    error Marketplace_NoFeesToWithdraw();

    function initialize(address _registry, address _initialOwner, address _platformFeeWallet, uint256 _platformFeePercent) public initializer {
        __Ownable_init(_initialOwner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        registry = FusionAI_ModelRegistryUpgradeable(_registry);
        platformFeeWallet = _platformFeeWallet;
        platformFeePercent = _platformFeePercent;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // --- Copy Sale Logic ---
    function listItemForCopies(uint256 _modelId, uint256 _price, uint256 _totalCopies) external {
        FusionAI_ModelRegistryUpgradeable.Model memory model = registry.getModel(_modelId);
        if (model.owner != msg.sender) revert Marketplace_NotModelOwner();
        if (_price == 0) revert Marketplace_InvalidPrice();
        if (_totalCopies == 0) revert Marketplace_InvalidTotalCopies();
        if (copySales[_modelId].price > 0) revert Marketplace_AlreadyListedForCopies();
        registry.setSaleType(_modelId, FusionAI_ModelRegistryUpgradeable.SaleType.Copies);
        copySales[_modelId] = CopySale({price: _price, totalCopies: _totalCopies, soldCopies: 0});
        emit ItemListedForCopies(_modelId, msg.sender, _price, _totalCopies);
    }

    function buyCopy(uint256 _modelId) external payable nonReentrant {
        CopySale storage sale = copySales[_modelId];
        if (sale.price == 0) revert Marketplace_NotListedForCopies();
        if (msg.value < sale.price) revert Marketplace_IncorrectPayment();
        if (sale.soldCopies >= sale.totalCopies) revert Marketplace_SoldOut();
        FusionAI_ModelRegistryUpgradeable.Model memory model = registry.getModel(_modelId);
        uint256 platformFee = (msg.value * platformFeePercent) / 100;
        uint256 payout = msg.value - platformFee;
        _safeTransfer(payable(platformFeeWallet), platformFee);
        _safeTransfer(payable(model.owner), payout);
        sale.soldCopies++;
        emit ItemPurchased(_modelId, msg.sender, sale.price, model.owner, platformFeeWallet, platformFee);
    }

    function getCopySaleDetails(uint256 _modelId) public view returns (uint256 price, uint256 totalCopies, uint256 soldCopies) {
        CopySale storage sale = copySales[_modelId];
        if (sale.price == 0) revert Marketplace_NotListedForCopies();
        return (sale.price, sale.totalCopies, sale.soldCopies);
    }

    // --- Subscription Listing ---
    function listItemForSubscription(uint256 _modelId, uint256 _rate, uint32 _durationSeconds) external {
        FusionAI_ModelRegistryUpgradeable.Model memory model = registry.getModel(_modelId);
        if (model.owner != msg.sender) revert Marketplace_NotModelOwner();
        registry.setSaleType(_modelId, FusionAI_ModelRegistryUpgradeable.SaleType.Subscription);
        subscriptions[_modelId] = Subscription({rate: _rate, durationSeconds: _durationSeconds});
        emit ItemListedForSubscription(_modelId, msg.sender, _rate, _durationSeconds);
    }

    function subscribe(uint256 _modelId) external payable nonReentrant {
        Subscription memory sub = subscriptions[_modelId];
        if (sub.rate == 0 || sub.durationSeconds == 0) revert Marketplace_NotListedForCopies();
        if (msg.value < sub.rate) revert Marketplace_IncorrectPayment();
        uint256 currentExpiry = userSubscriptions[_modelId][msg.sender];
        uint256 nowTime = block.timestamp;
        uint256 newExpiry;
        if (currentExpiry > nowTime) {
            newExpiry = currentExpiry + sub.durationSeconds;
        } else {
            newExpiry = nowTime + sub.durationSeconds;
        }
        userSubscriptions[_modelId][msg.sender] = newExpiry;
        FusionAI_ModelRegistryUpgradeable.Model memory model = registry.getModel(_modelId);
        uint256 platformFee = (msg.value * platformFeePercent) / 100;
        uint256 payout = msg.value - platformFee;
        _safeTransfer(payable(platformFeeWallet), platformFee);
        _safeTransfer(payable(model.owner), payout);
        emit Subscribed(_modelId, msg.sender, newExpiry);
    }

    function checkSubscription(uint256 _modelId, address _user) public view returns (bool) {
        return userSubscriptions[_modelId][_user] >= block.timestamp;
    }

    // --- Admin Functions ---
    function setPlatformFeePercent(uint256 _newFeePercent) public onlyOwner {
        if (_newFeePercent > 100) revert Marketplace_InvalidFeePercent();
        platformFeePercent = _newFeePercent;
    }
    function setPlatformFeeWallet(address _newWallet) public onlyOwner {
        if (_newWallet == address(0)) revert Marketplace_ZeroAddress();
        platformFeeWallet = _newWallet;
    }

    // --- Internal Helper ---
    function _safeTransfer(address payable _to, uint256 _amount) internal {
        if (_amount > 0) {
            (bool success, ) = _to.call{value: _amount}("");
            if (!success) {
                revert Marketplace_TransferFailed();
            }
        }
    }
}

