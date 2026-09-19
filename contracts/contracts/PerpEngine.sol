// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {Vault} from "./Vault.sol";

/**
 * @title PerpEngine
 * @notice Perpetual futures on Chainlink-priced assets, collateralised in the shared Vault.
 *
 * There is no orderbook: every position is filled at the oracle price, with
 * no spread and no slippage, and the engine's own capital is the counterparty.
 * Position size = collateral x leverage (1 to 20x). Funding is charged hourly
 * on the heavier side of the book, at (long OI - short OI) / total OI x 0.01,
 * capped at 0.05% per hour. A position is liquidatable when collateral plus
 * unrealised PnL falls below 5% of its size; the liquidator keeps 1% of what
 * is left and the rest goes back to the trader.
 *
 * All amounts are USDG (6 decimals); prices carry 8 decimals; funding rates
 * and the cumulative funding index are 1e18-scaled fractions of size.
 */
contract PerpEngine {
    uint256 public constant BPS = 10_000;
    uint256 public constant PRICE_SCALE = 1e8;
    uint256 public constant MAX_LEVERAGE = 20;
    uint256 public constant MAINTENANCE_MARGIN_BPS = 500;
    uint256 public constant LIQUIDATOR_FEE_BPS = 100;
    uint256 public constant FUNDING_INTERVAL = 1 hours;
    int256 public constant FUNDING_SCALE = 1e18;
    int256 public constant FUNDING_SENSITIVITY = 1e16; // 0.01 x imbalance, per hour
    int256 public constant MAX_FUNDING_RATE = 5e14; // 0.05% per hour
    uint256 public constant MAX_OI_PER_MARKET = 5_000_000e6;
    uint256 public constant DEFAULT_COVERAGE_BPS = 2_000; // capital must cover 20% of net exposure
    /// @dev A feed print older than this is refused (stock feeds pause over long weekends).
    uint256 public constant MAX_PRICE_AGE = 5 days;

    struct Market {
        address priceFeed;
        uint256 maxLeverage;
        uint256 maintenanceMargin;
        int256 cumulativeFunding;
        uint256 longOpenInterest;
        uint256 shortOpenInterest;
        uint256 lastFundingTime;
        bool exists;
    }

    struct Position {
        address trader;
        uint8 marketIndex;
        bool isLong;
        uint256 size;
        uint256 collateral;
        uint256 entryPrice;
        int256 fundingSnapshot;
        uint256 openedAt;
    }

    Vault public immutable vault;
    address public owner;

    Market[] public marketList;
    Position[] private positions;
    mapping(address => uint256[]) private traderPositions;

    /// @notice The engine's own capital: what backs profitable positions and absorbs losing ones.
    uint256 public engineCapital;
    /// @notice Collateral of open positions, held by the engine on the traders' behalf.
    uint256 public totalCollateral;
    uint256 public coverageBps = DEFAULT_COVERAGE_BPS;
    uint256 public maxOiPerMarket = MAX_OI_PER_MARKET;

    event MarketAdded(uint8 indexed marketIndex, address priceFeed);
    event PositionOpened(
        uint256 indexed id,
        address indexed trader,
        uint8 indexed marketIndex,
        bool isLong,
        uint256 size,
        uint256 collateral,
        uint256 entryPrice
    );
    event PositionClosed(uint256 indexed id, address indexed trader, int256 pnl, uint256 returned, uint256 exitPrice);
    event Liquidated(uint256 indexed id, address indexed liquidator, uint256 reward, uint256 markPrice);
    event CollateralAdded(uint256 indexed id, uint256 amount);
    event FundingUpdated(uint8 indexed marketIndex, int256 rate, int256 cumulativeFunding);
    event LiquidityAdded(address indexed from, uint256 amount);
    event LiquidityRemoved(address indexed to, uint256 amount);

    error NotOwner();
    error UnknownMarket();
    error UnknownPosition();
    error NotTrader();
    error ZeroAmount();
    error BadLeverage();
    error BadParameter();
    error OpenInterestCap();
    error InsufficientEngineCapital();
    error PositionClosedAlready();
    error StillSolvent();
    error NotLiquidatable();
    error StalePrice();
    error TooSoon();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address vault_) {
        vault = Vault(vault_);
        owner = msg.sender;
    }

    // ---------------------------------------------------------------- views

    function marketCount() external view returns (uint256) {
        return marketList.length;
    }

    function getMarket(uint8 marketIndex) external view returns (Market memory) {
        if (marketIndex >= marketList.length) revert UnknownMarket();
        return marketList[marketIndex];
    }

    function positionCount() external view returns (uint256) {
        return positions.length;
    }

    function getPosition(uint256 id) external view returns (Position memory) {
        if (id >= positions.length) revert UnknownPosition();
        return positions[id];
    }

    function positionIdsOf(address trader) external view returns (uint256[] memory) {
        return traderPositions[trader];
    }

    /// @notice The oracle price, 8 decimals. Reverts when the feed is empty or too old.
    function markPrice(uint8 marketIndex) public view returns (uint256) {
        if (marketIndex >= marketList.length) revert UnknownMarket();
        (, int256 answer,, uint256 updatedAt,) = AggregatorV3Interface(marketList[marketIndex].priceFeed).latestRoundData();
        if (answer <= 0 || updatedAt + MAX_PRICE_AGE < block.timestamp) revert StalePrice();
        return uint256(answer);
    }

    /// @notice Hourly funding rate, 1e18-scaled. Positive means longs pay shorts.
    function currentFundingRate(uint8 marketIndex) public view returns (int256) {
        if (marketIndex >= marketList.length) revert UnknownMarket();
        Market storage m = marketList[marketIndex];
        uint256 total = m.longOpenInterest + m.shortOpenInterest;
        if (total == 0) return 0;
        int256 imbalance = (int256(m.longOpenInterest) - int256(m.shortOpenInterest)) * FUNDING_SCALE / int256(total);
        int256 rate = imbalance * FUNDING_SENSITIVITY / FUNDING_SCALE;
        if (rate > MAX_FUNDING_RATE) return MAX_FUNDING_RATE;
        if (rate < -MAX_FUNDING_RATE) return -MAX_FUNDING_RATE;
        return rate;
    }

    /// @notice Funding owed by (positive) or to (negative) a position since it opened, in USDG.
    function accruedFunding(uint256 id) public view returns (int256) {
        Position storage p = _position(id);
        Market storage m = marketList[p.marketIndex];
        int256 index = m.cumulativeFunding + _pendingFunding(m);
        int256 owed = int256(p.size) * (index - p.fundingSnapshot) / FUNDING_SCALE;
        return p.isLong ? owed : -owed;
    }

    /// @notice Price PnL minus funding, in USDG.
    function getPnL(uint256 id) public view returns (int256) {
        Position storage p = _position(id);
        return _pricePnl(p, markPrice(p.marketIndex)) - accruedFunding(id);
    }

    /// @notice collateral + PnL. What the trader would get back, before flooring at zero.
    function equity(uint256 id) public view returns (int256) {
        Position storage p = _position(id);
        return int256(p.collateral) + getPnL(id);
    }

    function isLiquidatable(uint256 id) public view returns (bool) {
        Position storage p = _position(id);
        if (p.size == 0) return false;
        return equity(id) <= int256((p.size * marketList[p.marketIndex].maintenanceMargin) / BPS);
    }

    /// @notice The mark price at which the position hits maintenance margin (funding to date included).
    function getLiquidationPrice(uint256 id) external view returns (uint256) {
        Position storage p = _position(id);
        if (p.size == 0) return 0;
        // equity(price) = collateral + size x (price - entry) / entry - funding  (long)
        // solve for equity = size x maintenance
        int256 maintenance = int256((p.size * marketList[p.marketIndex].maintenanceMargin) / BPS);
        int256 buffer = int256(p.collateral) - accruedFunding(id) - maintenance; // how much price PnL can be lost
        int256 move = buffer * int256(p.entryPrice) / int256(p.size); // in price units
        int256 price = p.isLong ? int256(p.entryPrice) - move : int256(p.entryPrice) + move;
        return price > 0 ? uint256(price) : 0;
    }

    /// @notice Everything the engine holds in the vault: capital plus open collateral.
    function liquidity() external view returns (uint256) {
        return vault.balanceOf(address(this));
    }

    /// @notice Sum over markets of |long OI - short OI|: what the engine is actually exposed to.
    function netExposure() public view returns (uint256 total) {
        uint256 n = marketList.length;
        for (uint256 i = 0; i < n; i++) {
            Market storage m = marketList[i];
            total += m.longOpenInterest > m.shortOpenInterest
                ? m.longOpenInterest - m.shortOpenInterest
                : m.shortOpenInterest - m.longOpenInterest;
        }
    }

    /// @notice The net exposure the current capital can cover. Unlimited when coverage is 0.
    function maxNetExposure() public view returns (uint256) {
        if (coverageBps == 0) return type(uint256).max;
        return (engineCapital * BPS) / coverageBps;
    }

    // ---------------------------------------------------------------- owner

    function addMarket(address priceFeed) external onlyOwner returns (uint8 marketIndex) {
        if (priceFeed == address(0) || marketList.length >= 255) revert BadParameter();
        marketIndex = uint8(marketList.length);
        marketList.push(
            Market({
                priceFeed: priceFeed,
                maxLeverage: MAX_LEVERAGE,
                maintenanceMargin: MAINTENANCE_MARGIN_BPS,
                cumulativeFunding: 0,
                longOpenInterest: 0,
                shortOpenInterest: 0,
                lastFundingTime: block.timestamp,
                exists: true
            })
        );
        emit MarketAdded(marketIndex, priceFeed);
    }

    function setCoverageBps(uint256 value) external onlyOwner {
        if (value > BPS) revert BadParameter();
        coverageBps = value;
    }

    function setMaxOiPerMarket(uint256 value) external onlyOwner {
        if (value == 0) revert BadParameter();
        maxOiPerMarket = value;
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    /// @notice Take engine capital out. Never touches open collateral.
    function withdrawLiquidity(address to, uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        if (amount > engineCapital) revert InsufficientEngineCapital();
        engineCapital -= amount;
        vault.payout(to, amount);
        emit LiquidityRemoved(to, amount);
    }

    // ---------------------------------------------------------------- anyone

    /// @notice Add engine capital from your free vault balance. Anyone can back the book.
    function fund(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        _pull(msg.sender, amount);
        engineCapital += amount;
        emit LiquidityAdded(msg.sender, amount);
    }

    /// @notice Settle the funding that has accrued on a market. Called by every trade; callable by anyone hourly.
    function updateFunding(uint8 marketIndex) external {
        if (marketIndex >= marketList.length) revert UnknownMarket();
        Market storage m = marketList[marketIndex];
        if (block.timestamp < m.lastFundingTime + FUNDING_INTERVAL) revert TooSoon();
        _settleFunding(m, marketIndex);
    }

    function openPosition(uint8 marketIndex, bool isLong, uint256 collateral, uint256 leverage)
        external
        returns (uint256 id)
    {
        if (marketIndex >= marketList.length) revert UnknownMarket();
        if (collateral == 0) revert ZeroAmount();
        Market storage m = marketList[marketIndex];
        if (leverage == 0 || leverage > m.maxLeverage) revert BadLeverage();
        if (engineCapital == 0) revert InsufficientEngineCapital();

        _settleFunding(m, marketIndex);
        uint256 size = collateral * leverage;
        uint256 sideOi = (isLong ? m.longOpenInterest : m.shortOpenInterest) + size;
        if (sideOi > maxOiPerMarket) revert OpenInterestCap();

        uint256 price = markPrice(marketIndex);
        _pull(msg.sender, collateral);
        totalCollateral += collateral;
        if (isLong) m.longOpenInterest = sideOi;
        else m.shortOpenInterest = sideOi;
        // The engine is the counterparty: it will not take on more net exposure than its capital covers.
        if (netExposure() > maxNetExposure()) revert InsufficientEngineCapital();

        id = positions.length;
        positions.push(
            Position({
                trader: msg.sender,
                marketIndex: marketIndex,
                isLong: isLong,
                size: size,
                collateral: collateral,
                entryPrice: price,
                fundingSnapshot: m.cumulativeFunding,
                openedAt: block.timestamp
            })
        );
        traderPositions[msg.sender].push(id);
        emit PositionOpened(id, msg.sender, marketIndex, isLong, size, collateral, price);
    }

    /// @notice Top up a position's collateral from your free vault balance.
    function addCollateral(uint256 id, uint256 amount) external {
        Position storage p = _position(id);
        if (p.trader != msg.sender) revert NotTrader();
        if (p.size == 0) revert PositionClosedAlready();
        if (amount == 0) revert ZeroAmount();
        _pull(msg.sender, amount);
        p.collateral += amount;
        totalCollateral += amount;
        emit CollateralAdded(id, amount);
    }

    /// @notice Close at the oracle price. Profit is paid out of engine capital, losses go into it.
    function closePosition(uint256 id) external returns (uint256 returned) {
        Position storage p = _position(id);
        if (p.trader != msg.sender) revert NotTrader();
        if (p.size == 0) revert PositionClosedAlready();
        Market storage m = marketList[p.marketIndex];
        _settleFunding(m, p.marketIndex);
        uint256 price = markPrice(p.marketIndex);
        int256 pnl = _pricePnl(p, price) - _funding(p, m);
        returned = _close(p, m, pnl);
        if (returned > 0) vault.payout(msg.sender, returned);
        emit PositionClosed(id, msg.sender, pnl, returned, price);
    }

    /// @notice Liquidate an under-margined position. The caller keeps 1% of what is left; the trader gets the rest.
    function liquidate(uint256 id) external returns (uint256 reward) {
        Position storage p = _position(id);
        if (p.size == 0) revert NotLiquidatable();
        Market storage m = marketList[p.marketIndex];
        _settleFunding(m, p.marketIndex);
        uint256 price = markPrice(p.marketIndex);
        int256 pnl = _pricePnl(p, price) - _funding(p, m);
        if (int256(p.collateral) + pnl > int256((p.size * m.maintenanceMargin) / BPS)) revert StillSolvent();
        address trader = p.trader;
        uint256 remaining = _close(p, m, pnl);
        reward = (remaining * LIQUIDATOR_FEE_BPS) / BPS;
        if (reward > 0) vault.payout(msg.sender, reward);
        if (remaining - reward > 0) vault.payout(trader, remaining - reward);
        emit Liquidated(id, msg.sender, reward, price);
    }

    // ------------------------------------------------------------- internal

    function _position(uint256 id) private view returns (Position storage) {
        if (id >= positions.length) revert UnknownPosition();
        return positions[id];
    }

    /// @dev Move `amount` of the user's free balance into this contract's vault balance.
    function _pull(address from, uint256 amount) private {
        vault.lockCollateral(from, amount);
        vault.settle(from, address(this), amount);
    }

    function _pricePnl(Position storage p, uint256 price) private view returns (int256) {
        int256 diff = int256(price) - int256(p.entryPrice);
        int256 pnl = int256(p.size) * diff / int256(p.entryPrice);
        return p.isLong ? pnl : -pnl;
    }

    function _funding(Position storage p, Market storage m) private view returns (int256) {
        int256 owed = int256(p.size) * (m.cumulativeFunding - p.fundingSnapshot) / FUNDING_SCALE;
        return p.isLong ? owed : -owed;
    }

    /// @dev Funding accrued since the last settlement, for the whole hours elapsed.
    function _pendingFunding(Market storage m) private view returns (int256) {
        uint256 intervals = (block.timestamp - m.lastFundingTime) / FUNDING_INTERVAL;
        if (intervals == 0) return 0;
        uint256 total = m.longOpenInterest + m.shortOpenInterest;
        if (total == 0) return 0;
        int256 imbalance = (int256(m.longOpenInterest) - int256(m.shortOpenInterest)) * FUNDING_SCALE / int256(total);
        int256 rate = imbalance * FUNDING_SENSITIVITY / FUNDING_SCALE;
        if (rate > MAX_FUNDING_RATE) rate = MAX_FUNDING_RATE;
        if (rate < -MAX_FUNDING_RATE) rate = -MAX_FUNDING_RATE;
        return rate * int256(intervals);
    }

    function _settleFunding(Market storage m, uint8 marketIndex) private {
        uint256 intervals = (block.timestamp - m.lastFundingTime) / FUNDING_INTERVAL;
        if (intervals == 0) return;
        int256 pending = _pendingFunding(m);
        m.cumulativeFunding += pending;
        m.lastFundingTime += intervals * FUNDING_INTERVAL;
        emit FundingUpdated(marketIndex, pending / int256(intervals), m.cumulativeFunding);
    }

    /// @dev Book the close: returns what is left of the collateral after `pnl`, capped by what the engine can pay.
    function _close(Position storage p, Market storage m, int256 pnl) private returns (uint256 returned) {
        uint256 collateral = p.collateral;
        int256 eq = int256(collateral) + pnl;
        if (eq <= 0) {
            returned = 0;
        } else {
            returned = uint256(eq);
            // A profit is paid out of engine capital; the engine never pays more than it holds.
            if (returned > collateral) {
                uint256 profit = returned - collateral;
                if (profit > engineCapital) profit = engineCapital;
                returned = collateral + profit;
            }
        }
        if (returned > collateral) engineCapital -= returned - collateral;
        else engineCapital += collateral - returned;
        totalCollateral -= collateral;
        if (p.isLong) m.longOpenInterest -= p.size;
        else m.shortOpenInterest -= p.size;
        p.size = 0;
        p.collateral = 0;
    }
}
