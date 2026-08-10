"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.veloGaugeAbi = void 0;
// Velodrome/Aerodrome Gauge ABI
// Provides methods to read gauge state: periodFinish, rewardRate, totalSupply, rewardToken, decimals
exports.veloGaugeAbi = [
    {
        inputs: [],
        name: 'periodFinish',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'rewardRate',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'totalSupply',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'rewardToken',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
    {
        inputs: [],
        name: 'decimals',
        outputs: [{ name: '', type: 'uint8' }],
        stateMutability: 'view',
        type: 'function',
    },
];
