"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.veloVoterAbi = void 0;
// Velodrome/Aerodrome Voter Registry ABI
// Provides the gauges(address) function to lookup gauge address for an LP token
exports.veloVoterAbi = [
    {
        inputs: [{ name: '_pool', type: 'address' }],
        name: 'gauges',
        outputs: [{ name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
];
