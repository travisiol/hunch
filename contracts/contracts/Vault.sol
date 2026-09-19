// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "./interfaces/IERC20.sol";

/**
 * @title Vault
 * @notice One USDG balance per address, shared by every HUNCH market.
 *
 * A balance is split in two: `free` (withdrawable at any time) and `locked`
 * (committed to an open bet or position). Only contracts the owner has
 * flagged as markets can move collateral, and a market can only ever pay out
 * of the balance it holds itself — nothing here can create collateral that
 * was not deposited.
 *
 * Market primitives:
 *  - lockCollateral(user, amount)    user.free   -> user.locked
 *  - releaseCollateral(user, amount) user.locked -> user.free
 *  - settle(from, to, amount)        from.locked -> to.free   (a stake joins a pool, a loser pays a winner)
 *  - payout(to, amount)              market.free -> to.free   (a pool pays a winner)
 */
contract Vault {
    IERC20 public immutable collateral;
    address public owner;

    mapping(address => uint256) public free;
    mapping(address => uint256) public locked;
    mapping(address => bool) public isMarket;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Locked(address indexed user, address indexed market, uint256 amount);
    event Released(address indexed user, address indexed market, uint256 amount);
    event Settled(address indexed from, address indexed to, uint256 amount);
    event MarketSet(address indexed market, bool allowed);
    event OwnerChanged(address indexed newOwner);

    error ZeroAmount();
    error InsufficientFree();
    error InsufficientLocked();
    error NotMarket();
    error NotOwner();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyMarket() {
        if (!isMarket[msg.sender]) revert NotMarket();
        _;
    }

    constructor(address collateral_) {
        collateral = IERC20(collateral_);
        owner = msg.sender;
        emit OwnerChanged(msg.sender);
    }

    // ---------------------------------------------------------------- users

    /// @notice Move USDG from your wallet into your free balance. Approve the vault first.
    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (!collateral.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        free[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /// @notice Move free balance back to your wallet. Locked balance has to settle first.
    function withdraw(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        uint256 f = free[msg.sender];
        if (f < amount) revert InsufficientFree();
        free[msg.sender] = f - amount;
        if (!collateral.transfer(msg.sender, amount)) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    function freeBalanceOf(address user) external view returns (uint256) {
        return free[user];
    }

    function lockedBalanceOf(address user) external view returns (uint256) {
        return locked[user];
    }

    /// @notice free + locked.
    function balanceOf(address user) external view returns (uint256) {
        return free[user] + locked[user];
    }

    // -------------------------------------------------------------- markets

    function lockCollateral(address user, uint256 amount) external onlyMarket {
        if (amount == 0) revert ZeroAmount();
        uint256 f = free[user];
        if (f < amount) revert InsufficientFree();
        free[user] = f - amount;
        locked[user] += amount;
        emit Locked(user, msg.sender, amount);
    }

    function releaseCollateral(address user, uint256 amount) external onlyMarket {
        if (amount == 0) revert ZeroAmount();
        uint256 l = locked[user];
        if (l < amount) revert InsufficientLocked();
        locked[user] = l - amount;
        free[user] += amount;
        emit Released(user, msg.sender, amount);
    }

    function settle(address from, address to, uint256 amount) external onlyMarket {
        if (amount == 0) revert ZeroAmount();
        uint256 l = locked[from];
        if (l < amount) revert InsufficientLocked();
        locked[from] = l - amount;
        free[to] += amount;
        emit Settled(from, to, amount);
    }

    /// @notice A market pays out of its own free balance. It cannot reach anyone else's.
    function payout(address to, uint256 amount) external onlyMarket {
        if (amount == 0) revert ZeroAmount();
        uint256 f = free[msg.sender];
        if (f < amount) revert InsufficientFree();
        free[msg.sender] = f - amount;
        free[to] += amount;
        emit Settled(msg.sender, to, amount);
    }

    // ---------------------------------------------------------------- owner

    function setMarket(address market, bool allowed) external onlyOwner {
        isMarket[market] = allowed;
        emit MarketSet(market, allowed);
    }

    function setOwner(address newOwner) external onlyOwner {
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }
}
