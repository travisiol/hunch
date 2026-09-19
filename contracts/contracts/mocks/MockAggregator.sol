// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";

/// @notice A Chainlink-shaped feed whose answer is set by anyone. Keeps a round history for the candles API.
contract MockAggregator is AggregatorV3Interface {
    struct Round {
        int256 answer;
        uint256 updatedAt;
    }

    uint8 public immutable decimals;
    string public description;
    Round[] private rounds;

    constructor(string memory description_, uint8 decimals_, int256 initialAnswer) {
        description = description_;
        decimals = decimals_;
        rounds.push(Round({answer: initialAnswer, updatedAt: block.timestamp}));
    }

    function setAnswer(int256 answer) external {
        rounds.push(Round({answer: answer, updatedAt: block.timestamp}));
    }

    /// @dev Backdate the latest round, to test staleness.
    function setUpdatedAt(uint256 updatedAt) external {
        rounds[rounds.length - 1].updatedAt = updatedAt;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        uint80 id = uint80(rounds.length - 1);
        Round storage r = rounds[id];
        return (id, r.answer, r.updatedAt, r.updatedAt, id);
    }

    function getRoundData(uint80 roundId) external view returns (uint80, int256, uint256, uint256, uint80) {
        require(roundId < rounds.length, "No data present");
        Round storage r = rounds[roundId];
        return (roundId, r.answer, r.updatedAt, r.updatedAt, roundId);
    }
}
