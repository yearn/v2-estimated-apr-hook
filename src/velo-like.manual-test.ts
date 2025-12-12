import 'dotenv/config';
import { computeVaultFapy } from ".";

async function test() {
  const data = {
    chainId: 10,
    address: '0xDdDCAeE873f2D9Df0E18a80709ef2B396d4a6EA5',
    blockNumber: 1234567890,
    blockTime: 1234567890,
    abiPath: '',
    subscription: {
      label: '',
      type: 'timeseries',
      abiPath: '',
      id: '',
      url: '',
    },
  };


  const result = await computeVaultFapy(data.chainId, data.address as `0x${string}`);
  console.log(result);
}

test();