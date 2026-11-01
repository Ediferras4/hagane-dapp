/**
 * wagmi configuration
 * Cleaned and optimized for Arc Mainnet
 */

import { http, createConfig } from 'wagmi'
import { arc } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Registo oficial do RPC da Arc Mainnet
const ARC_RPC = arc.rpcUrls.default.http[0]

registerChain(arc.id, ARC_RPC)

export const config = createConfig({
  chains: [arc],
  connectors: [injected()],
  transports: {
    [arc.id]: http(ARC_RPC, {
      batch: true, // Ativa o agrupamento de chamadas para poupar o RPC e acelerar a leitura
    }),
  },
})
