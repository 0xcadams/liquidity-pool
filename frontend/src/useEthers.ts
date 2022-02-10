import { BigNumber, ethers } from 'ethers';
import { useCallback, useEffect, useState } from 'react';
import { useWallet } from 'use-wallet';

import {
  SpaceCoin,
  SpaceCoinICO,
  SpaceCoinICO__factory as SpaceCoinICOFactory,
  SpaceCoin__factory as SpaceCoinFactory,
  SpaceRouter__factory as SpaceRouterFactory,
  SpaceCoinETHPair__factory as SpaceCoinETHPairFactory,
  SpaceRouter,
  SpaceCoinETHPair
} from '../types';

const useSpaceContracts = () => {
  const wallet = useWallet();
  const [contracts, setContracts] = useState<{
    spaceRouter: SpaceRouter | null;
    spaceCoinEthPair: SpaceCoinETHPair | null;
    spaceCoinICO: SpaceCoinICO | null;
    spaceCoin: SpaceCoin | null;
    address: string | null;
    signer: ethers.providers.JsonRpcSigner | null;
  }>({
    spaceRouter: null,
    spaceCoinEthPair: null,
    spaceCoinICO: null,
    spaceCoin: null,
    address: null,
    signer: null
  });

  useEffect(() => {
    (async () => {
      if (wallet.status === 'connected') {
        if (
          !process.env.NEXT_PUBLIC_ICO_CONTRACT_ADDRESS ||
          !process.env.NEXT_PUBLIC_ROUTER_CONTRACT_ADDRESS
        ) {
          throw new Error(
            'Must define process.env.NEXT_PUBLIC_ICO_CONTRACT_ADDRESS and NEXT_PUBLIC_ROUTER_CONTRACT_ADDRESS'
          );
        }

        const provider = new ethers.providers.Web3Provider(wallet.ethereum, 'rinkeby');
        const signer = provider.getSigner();

        const spaceCoinICO = SpaceCoinICOFactory.connect(
          process.env.NEXT_PUBLIC_ICO_CONTRACT_ADDRESS,
          signer
        );

        const spaceCoinAddress = await spaceCoinICO.spaceCoin();

        const spaceCoin = SpaceCoinFactory.connect(spaceCoinAddress, signer);

        const spaceRouter = SpaceRouterFactory.connect(
          process.env.NEXT_PUBLIC_ROUTER_CONTRACT_ADDRESS,
          signer
        );
        const spaceCoinEthPairAddress = await spaceRouter.spaceCoinEthPair();

        const spaceCoinEthPair = SpaceCoinETHPairFactory.connect(spaceCoinEthPairAddress, signer);

        setContracts({
          spaceRouter,
          spaceCoinEthPair,
          spaceCoinICO,
          spaceCoin,
          signer,
          address: wallet.account ?? null
        });
      }
    })();
  }, [wallet.status, wallet.account]);

  return contracts;
};

export const useGetBalance = (): BigNumber | undefined => {
  const { signer } = useSpaceContracts();

  const [value, setValue] = useState<BigNumber | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const balance = await signer?.getBalance();

      setValue(balance?.div(BigNumber.from(10).pow(16)));
    })();
  }, [signer]);

  return value;
};

export const useGetScaledNumberOfSpcTokens = (): BigNumber | undefined => {
  const { address, spaceCoin } = useSpaceContracts();

  const [value, setValue] = useState<BigNumber | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const balance = await spaceCoin?.balanceOf(address ?? '');

      setValue(balance?.div(BigNumber.from(10).pow(16)));
    })();
  }, [spaceCoin, address]);

  return value;
};

export const useGetScaledNumberOfSpcEthTokens = (): BigNumber | undefined => {
  const { address, spaceCoinEthPair } = useSpaceContracts();

  const [value, setValue] = useState<BigNumber | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const balance = await spaceCoinEthPair?.balanceOf(address ?? '');

      setValue(balance?.div(BigNumber.from(10).pow(16)));
    })();
  }, [spaceCoinEthPair, address]);

  return value;
};

export const useInvestInIco = () => {
  const { spaceCoinICO } = useSpaceContracts();

  return useCallback(
    async (amount: BigNumber) => {
      const result = await spaceCoinICO?.invest({
        value: amount
      });

      return result;
    },
    [spaceCoinICO]
  );
};

export const useClaimTokens = () => {
  const { spaceCoinICO } = useSpaceContracts();

  return useCallback(async () => {
    const result = await spaceCoinICO?.claimTokens();

    return result;
  }, [spaceCoinICO]);
};

export const useDeposit = () => {
  const { spaceRouter, spaceCoin, address } = useSpaceContracts();

  return useCallback(
    async (amountSpc: ethers.BigNumberish, amountEth: ethers.BigNumberish) => {
      if (!address || !spaceCoin || !spaceRouter) {
        throw new Error('Address or spaceCoin not defined.');
      }

      // approve the input amount
      const tx = await spaceCoin.approve(spaceRouter?.address, amountSpc);
      await tx.wait();

      const result = await spaceRouter?.addLiquidity(amountSpc, address, { value: amountEth });

      return result;
    },
    [spaceRouter, spaceCoin, address]
  );
};

export const useWithdraw = () => {
  const { spaceRouter, spaceCoinEthPair, address } = useSpaceContracts();

  return useCallback(
    async (liquidity: ethers.BigNumberish) => {
      if (!address || !spaceCoinEthPair || !spaceRouter) {
        throw new Error('Address not defined.');
      }

      // approve the input amount
      const tx = await spaceCoinEthPair.approve(spaceRouter?.address, liquidity);
      await tx.wait();

      const result = await spaceRouter?.removeLiquidity(liquidity, address);

      return result;
    },
    [spaceRouter, address]
  );
};

export const useGetReserves = (): [BigNumber, BigNumber] | undefined => {
  const { spaceCoinEthPair } = useSpaceContracts();

  const [value, setValue] = useState<[BigNumber, BigNumber] | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const reserves = await spaceCoinEthPair?.getReserves();

      setValue(reserves);
    })();
  }, [spaceCoinEthPair]);

  return value;
};

export const useSwapETHForSPC = () => {
  const { spaceRouter, address } = useSpaceContracts();

  return useCallback(
    async (amountIn: ethers.BigNumberish, amountOutMin: ethers.BigNumberish) => {
      if (!address) {
        throw new Error('Address not defined.');
      }

      const result = await spaceRouter?.swapETHForSPC(amountOutMin, address, { value: amountIn });

      return result;
    },
    [spaceRouter, address]
  );
};

export const useSwapSPCForETH = () => {
  const { spaceRouter, spaceCoin, address } = useSpaceContracts();

  return useCallback(
    async (amountIn: ethers.BigNumberish, amountOutMin: ethers.BigNumberish) => {
      if (!address || !spaceRouter || !spaceCoin) {
        throw new Error('Address not defined.');
      }

      // approve the input amount
      const tx = await spaceCoin.approve(spaceRouter?.address, amountIn);
      await tx.wait();

      const result = await spaceRouter?.swapSPCForETH(amountIn, amountOutMin, address);

      return result;
    },
    [spaceRouter, spaceCoin, address]
  );
};
