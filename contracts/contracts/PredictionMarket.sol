// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {Vault} from "./Vault.sol";

/**
 * @title PredictionMarket
 * @notice Parimutuel yes/no markets on Robinhood Chain assets, collateralised in the shared Vault.
 *
 * Every market is a question with a deadline. Stakes go into a YES pool and a
 * NO pool; the odds are the pools themselves. At settlement the winners get
 * their stake back and split the losing pool pro rata. A 2% fee is taken from
 * the losing pool only, so a winner is never paid less than their stake. If
 * one side is empty everyone is refunded in full and no fee is charged.
 *
 * Price markets resolve permissionlessly from a Chainlink feed once the
 * deadline passes: YES if the price is ABOVE (or BELOW) the target. Markets
 * without a feed are resolved by the owner.
 */
contract PredictionMarket {
    uint8 public constant ABOVE = 0;
    uint8 public constant BELOW = 1;
    uint256 public constant BPS = 10_000;
    uint256 public constant FEE_BPS = 200;
    /// @dev A feed print older than this at resolution is refused (stock feeds pause over long weekends).
    uint256 public constant MAX_PRICE_AGE = 5 days;

    struct Market {
        uint256 id;
        string question;
        address priceFeed;
        int256 targetPrice;
        uint8 comparator;
        uint256 resolutionTime;
        bool resolved;
        bool outcome;
        uint256 yesPool;
        uint256 noPool;
    }

    Vault public immutable vault;
    address public owner;
    address public feeRecipient;
    uint256 public marketCount;

    mapping(uint256 => Market) private markets;
    mapping(uint256 => mapping(address => uint256)) public yesStake;
    mapping(uint256 => mapping(address => uint256)) public noStake;
    mapping(uint256 => mapping(address => bool)) public claimed;

    event MarketCreated(
        uint256 indexed id, string question, address priceFeed, int256 targetPrice, uint8 comparator, uint256 resolutionTime
    );
    event Bet(uint256 indexed id, address indexed user, bool side, uint256 amount);
    event MarketResolved(uint256 indexed id, bool outcome, int256 price);
    event Claimed(uint256 indexed id, address indexed user, uint256 payout);

    error NotOwner();
    error UnknownMarket();
    error BadComparator();
    error ZeroAmount();
    error BettingClosed();
    error AlreadyResolved();
    error NotResolved();
    error TooEarly();
    error NoFeed();
    error HasFeed();
    error StalePrice();
    error AlreadyClaimed();
    error NothingToClaim();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address vault_, address feeRecipient_) {
        vault = Vault(vault_);
        owner = msg.sender;
        feeRecipient = feeRecipient_;
    }

    // ---------------------------------------------------------------- views

    function getMarket(uint256 id) external view returns (Market memory) {
        if (id >= marketCount) revert UnknownMarket();
        return markets[id];
    }

    /// @notice What `claim` would pay `user` right now. Zero until the market is resolved.
    function previewPayout(uint256 marketId, address user) public view returns (uint256) {
        if (marketId >= marketCount) return 0;
        Market storage m = markets[marketId];
        if (!m.resolved || claimed[marketId][user]) return 0;
        return _payout(m, yesStake[marketId][user], noStake[marketId][user]);
    }

    // ---------------------------------------------------------------- owner

    /// @param priceFeed a Chainlink feed, or address(0) for a market the owner resolves by hand.
    function createMarket(
        string calldata question,
        address priceFeed,
        int256 targetPrice,
        uint8 comparator,
        uint256 resolutionTime
    ) external onlyOwner returns (uint256 id) {
        if (comparator > BELOW) revert BadComparator();
        if (resolutionTime <= block.timestamp) revert TooEarly();
        id = marketCount++;
        Market storage m = markets[id];
        m.id = id;
        m.question = question;
        m.priceFeed = priceFeed;
        m.targetPrice = targetPrice;
        m.comparator = comparator;
        m.resolutionTime = resolutionTime;
        emit MarketCreated(id, question, priceFeed, targetPrice, comparator, resolutionTime);
    }

    /// @notice Resolve a market that has no feed. Only after its resolution time.
    function resolveManual(uint256 id, bool outcome) external onlyOwner {
        Market storage m = _open(id);
        if (m.priceFeed != address(0)) revert HasFeed();
        if (block.timestamp < m.resolutionTime) revert TooEarly();
        _resolve(m, outcome, 0);
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        feeRecipient = recipient;
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // ---------------------------------------------------------------- anyone

    /// @notice Stake `amount` of your free vault balance on a side. YES = true.
    function bet(uint256 marketId, bool side, uint256 amount) external {
        Market storage m = _open(marketId);
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp >= m.resolutionTime) revert BettingClosed();
        // The stake leaves the bettor's balance and joins the pool this contract holds.
        vault.lockCollateral(msg.sender, amount);
        vault.settle(msg.sender, address(this), amount);
        if (side) {
            m.yesPool += amount;
            yesStake[marketId][msg.sender] += amount;
        } else {
            m.noPool += amount;
            noStake[marketId][msg.sender] += amount;
        }
        emit Bet(marketId, msg.sender, side, amount);
    }

    /// @notice Resolve a price market from its Chainlink feed. Anyone, once the deadline has passed.
    function resolveMarket(uint256 id) external {
        Market storage m = _open(id);
        if (m.priceFeed == address(0)) revert NoFeed();
        if (block.timestamp < m.resolutionTime) revert TooEarly();
        (, int256 price,, uint256 updatedAt,) = AggregatorV3Interface(m.priceFeed).latestRoundData();
        if (price <= 0 || updatedAt + MAX_PRICE_AGE < block.timestamp) revert StalePrice();
        bool outcome = m.comparator == ABOVE ? price > m.targetPrice : price < m.targetPrice;
        _resolve(m, outcome, price);
    }

    /// @notice Collect your payout (or refund) from a resolved market.
    function claim(uint256 marketId) external returns (uint256 payout) {
        if (marketId >= marketCount) revert UnknownMarket();
        Market storage m = markets[marketId];
        if (!m.resolved) revert NotResolved();
        if (claimed[marketId][msg.sender]) revert AlreadyClaimed();
        payout = _payout(m, yesStake[marketId][msg.sender], noStake[marketId][msg.sender]);
        if (payout == 0) revert NothingToClaim();
        claimed[marketId][msg.sender] = true;
        vault.payout(msg.sender, payout);
        emit Claimed(marketId, msg.sender, payout);
    }

    // ------------------------------------------------------------- internal

    function _open(uint256 id) private view returns (Market storage m) {
        if (id >= marketCount) revert UnknownMarket();
        m = markets[id];
        if (m.resolved) revert AlreadyResolved();
    }

    function _resolve(Market storage m, bool outcome, int256 price) private {
        m.resolved = true;
        m.outcome = outcome;
        // The fee comes off the losing pool, and only when there is a losing pool and a winning pool.
        if (m.yesPool > 0 && m.noPool > 0) {
            uint256 losing = outcome ? m.noPool : m.yesPool;
            uint256 fee = (losing * FEE_BPS) / BPS;
            if (fee > 0) vault.payout(feeRecipient, fee);
        }
        emit MarketResolved(m.id, outcome, price);
    }

    /// @dev stake + stake x (losing pool x 0.98) / winning pool; a full refund when a side was empty.
    function _payout(Market storage m, uint256 yes, uint256 no) private view returns (uint256) {
        if (m.yesPool == 0 || m.noPool == 0) return yes + no;
        uint256 winning = m.outcome ? m.yesPool : m.noPool;
        uint256 losing = m.outcome ? m.noPool : m.yesPool;
        uint256 stake = m.outcome ? yes : no;
        if (stake == 0) return 0;
        uint256 share = (stake * ((losing * (BPS - FEE_BPS)) / BPS)) / winning;
        return stake + share;
    }
}
