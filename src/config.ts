/**
 * wagmi configuration
 * Optimized with reliable transport for Arc Mainnet
 */

import { http, createConfig } from 'wagmi'
import { arc } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

const ARC_RPC = 'https://rpc.mainnet.arc.io'

registerChain(arc.id, ARC_RPC)

export const config = createConfig({
  chains: [arc],
  connectors: [injected()],
  transports: {
    [arc.id]: http(ARC_RPC, {
      batch: true,
      timeout: 30_000, // Aumenta o tempo limite para evitar falhas de leitura
    }),
  },
})

