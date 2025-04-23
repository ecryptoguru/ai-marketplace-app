// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./FusionAI_ModelRegistry.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol"; // Corrected path for v5+
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FusionAI_Marketplace
 * @dev Handles the listing, sale (limited copies), and fee distribution for AI models.
 */
contract FusionAI_Marketplace is ReentrancyGuard, Ownable {
    // --- Interface ---
    FusionAI_ModelRegistry public registry;

    // --- State Variables ---
    address public platformFeeWallet;
    uint256 public platformFeePercent; // e.g., 3 for 3%

    struct CopySale {
        uint256 price;
        uint256 totalCopies;
        uint256 soldCopies;
    }

    mapping(uint256 => CopySale) public copySales; // modelId => Sale details

    // --- Subscription Struct & Mappings ---
    struct Subscription {
        uint256 rate;
        uint32 durationSeconds;
    }
    mapping(uint256 => Subscription) public subscriptions;
    mapping(uint256 => mapping(address => uint256)) public userSubscriptions;

    // --- Events ---
    event ItemListedForSubscription(
        uint256 indexed modelId,
        address indexed owner,
        uint256 rate,
        uint32 durationSeconds
    );
    event Subscribed(
        uint256 indexed modelId,
        address indexed subscriber,
        uint256 expiryTimestamp
    );

    event ItemListedForCopies(
        uint256 indexed modelId,
        address indexed owner,
        uint256 price,
        uint256 totalCopies
    );

    event ItemPurchased(
        uint256 indexed modelId,
        address indexed buyer,
        uint256 price,
        address seller,
        address platformWallet,
        uint256 platformFee
    );

    event PlatformFeesWithdrawn(address indexed owner, uint256 amount);

    // --- Errors ---
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

    // --- Constructor ---
    constructor(
        address _registryAddress,
        address _initialOwner, // From Ownable
        address _platformFeeWallet,
        uint256 _platformFeePercent
    ) Ownable(_initialOwner) {
        if (_registryAddress == address(0) || _platformFeeWallet == address(0)) {
            revert Marketplace_ZeroAddress();
        }
        // Fee percent should be reasonable, e.g., 0-100
        if (_platformFeePercent > 100) {
            revert Marketplace_InvalidFeePercent();
        }
        registry = FusionAI_ModelRegistry(_registryAddress);
        platformFeeWallet = _platformFeeWallet;
        platformFeePercent = _platformFeePercent;
    }

    // --- Functions ---

    /**
     * @dev Lists a model for sale as limited copies.
     *      - Requires caller to be the model owner.
     *      - Sets the model's saleType in the registry to Copies.
     * @param _modelId The ID of the model to list.
     * @param _price The price per copy in Wei.
     * @param _totalCopies The total number of copies available for sale.
     */
    function listItemForCopies(uint256 _modelId, uint256 _price, uint256 _totalCopies) public nonReentrant {
        // Check inputs
        if (_price == 0) revert Marketplace_InvalidPrice();
        if (_totalCopies == 0) revert Marketplace_InvalidTotalCopies();

        // Check model exists in registry and get owner
        (address modelOwner, , , ) = registry.models(_modelId);
        if (modelOwner == address(0)) revert Marketplace_InvalidModelId(); // Model doesn't exist

        // Check ownership
        if (modelOwner != msg.sender) revert Marketplace_NotModelOwner();

        // Check if already listed for copies (can't overwrite easily)
        if (copySales[_modelId].price > 0) revert Marketplace_AlreadyListedForCopies();

        // Store sale details
        copySales[_modelId] = CopySale({
            price: _price,
            totalCopies: _totalCopies,
            soldCopies: 0
        });

        emit ItemListedForCopies(_modelId, msg.sender, _price, _totalCopies);
    }

    /**
     * @dev Purchases one copy of a listed model.
     *      - Requires `msg.value` to equal the price.
     *      - Transfers funds to the seller and platform wallet.
     * @param _modelId The ID of the model to purchase.
     */
    function buyCopy(uint256 _modelId) public payable nonReentrant {
        CopySale storage sale = copySales[_modelId];

        // Check if listed and has a valid price
        if (sale.price == 0) revert Marketplace_NotListedForCopies();

        // Check if sold out
        if (sale.soldCopies >= sale.totalCopies) revert Marketplace_SoldOut();

        // Check payment amount
        if (msg.value != sale.price) revert Marketplace_IncorrectPayment();

        // Increment sold count
        sale.soldCopies++;

        // Calculate fees and payouts
        uint256 platformFeeAmount = (sale.price * platformFeePercent) / 100;
        uint256 developerPayout = sale.price - platformFeeAmount;

        // Get seller address from registry
        (address seller, , , ) = registry.models(_modelId);
        if (seller == address(0)) revert Marketplace_InvalidModelId(); // Should not happen if listed, but safety check

        // Transfer funds
        _safeTransfer(payable(platformFeeWallet), platformFeeAmount);
        _safeTransfer(payable(seller), developerPayout);

        emit ItemPurchased(
            _modelId,
            msg.sender,
            sale.price,
            seller,
            platformFeeWallet,
            platformFeeAmount
        );
    }

    /**
     * @dev Allows the platform owner to withdraw accumulated fees.
     */
    function withdrawPlatformFees() public onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert Marketplace_NoFeesToWithdraw();

        // Transfer entire contract balance to platform fee wallet
        _safeTransfer(payable(platformFeeWallet), balance);

        emit PlatformFeesWithdrawn(msg.sender, balance);
    }

    // --- Getters ---

    /**
     * @dev Returns the sale details for a model listed for copy sales.
     * @param _modelId The ID of the model.
     * @return price The price per copy.
     * @return totalCopies The total number of copies available.
     * @return soldCopies The number of copies already sold.
     */
    function getCopySaleDetails(uint256 _modelId) public view returns (uint256 price, uint256 totalCopies, uint256 soldCopies) {
        CopySale storage sale = copySales[_modelId];
        // Check if model exists implicitly by checking price > 0, assuming valid listings always have price > 0
        // More robust check might involve querying the registry, but increases gas.
        if (sale.price == 0) {
             revert Marketplace_NotListedForCopies();
        }
        return (sale.price, sale.totalCopies, sale.soldCopies);
    }

    // --- Subscription Listing ---
    function listItemForSubscription(uint256 _modelId, uint256 _rate, uint32 _durationSeconds) external {
        // Check ownership
        FusionAI_ModelRegistry.Model memory model = registry.getModel(_modelId);
        if (model.owner != msg.sender) revert Marketplace_NotModelOwner();

        // Set sale type to Subscription in registry
        registry.setSaleType(_modelId, FusionAI_ModelRegistry.SaleType.Subscription);

        // Store subscription details
        subscriptions[_modelId] = Subscription({
            rate: _rate,
            durationSeconds: _durationSeconds
        });

        emit ItemListedForSubscription(_modelId, msg.sender, _rate, _durationSeconds);
    }

    // --- Subscribe ---
    function subscribe(uint256 _modelId) external payable nonReentrant {
        Subscription memory sub = subscriptions[_modelId];
        if (sub.rate == 0 || sub.durationSeconds == 0) revert Marketplace_NotListedForCopies(); // Reuse error for not listed
        if (msg.value < sub.rate) revert Marketplace_IncorrectPayment();

        // Calculate new expiry
        uint256 currentExpiry = userSubscriptions[_modelId][msg.sender];
        uint256 nowTime = block.timestamp;
        uint256 newExpiry;
        if (currentExpiry > nowTime) {
            // Extend
            newExpiry = currentExpiry + sub.durationSeconds;
        } else {
            newExpiry = nowTime + sub.durationSeconds;
        }
        userSubscriptions[_modelId][msg.sender] = newExpiry;

        // Handle ETH transfer (platform fee and payout)
        FusionAI_ModelRegistry.Model memory model = registry.getModel(_modelId);
        uint256 platformFee = (msg.value * platformFeePercent) / 100;
        uint256 payout = msg.value - platformFee;

        _safeTransfer(payable(platformFeeWallet), platformFee);
        _safeTransfer(payable(model.owner), payout);

        emit Subscribed(_modelId, msg.sender, newExpiry);
    }

    // --- Check Subscription ---
    function checkSubscription(uint256 _modelId, address _user) public view returns (bool) {
        return userSubscriptions[_modelId][_user] >= block.timestamp;
    }

    // --- Admin Functions (Platform Fee Management) ---

     /**
     * @dev Updates the platform fee percentage. Only callable by the owner.
     * @param _newFeePercent The new fee percentage (e.g., 5 for 5%).
     */
    function setPlatformFeePercent(uint256 _newFeePercent) public onlyOwner {
        if (_newFeePercent > 100) { // Basic sanity check
            revert Marketplace_InvalidFeePercent();
        }
        platformFeePercent = _newFeePercent;
    }

    /**
     * @dev Updates the wallet address where platform fees are collected. Only callable by the owner.
     * @param _newWallet The new wallet address.
     */
    function setPlatformFeeWallet(address _newWallet) public onlyOwner {
        if (_newWallet == address(0)) {
            revert Marketplace_ZeroAddress();
        }
        platformFeeWallet = _newWallet;
    }

    // --- Internal Helper ---

    /**
     * @dev Internal function to safely transfer ETH.
     */
    function _safeTransfer(address payable _to, uint256 _amount) internal {
        if (_amount > 0) {
            (bool success, ) = _to.call{value: _amount}("");
            if (!success) {
                revert Marketplace_TransferFailed();
            }
        }
    }
}
