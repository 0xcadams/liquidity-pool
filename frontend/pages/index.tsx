import { BigNumber, ethers } from 'ethers';
import type { NextPage } from 'next';
import Head from 'next/head';
import { useState } from 'react';
import styles from '../styles/Home.module.css';

import { useWallet } from 'use-wallet';
import {
  useClaimTokens,
  useDeposit,
  useGetBalance,
  useGetReserves,
  useGetScaledNumberOfSpcEthTokens,
  useGetScaledNumberOfSpcTokens,
  useInvestInIco,
  useSwapETHForSPC,
  useSwapSPCForETH,
  useWithdraw
} from '../src';

const Home: NextPage = () => {
  const wallet = useWallet();

  const [ethInvest, setEthInvest] = useState<string>('');

  const [spcToSwap, setSpcToSwap] = useState<string>('');
  const [spcToSwapSlippage, setSpcToSwapSlippage] = useState<string>('');

  const [ethToSwap, setEthToSwap] = useState<string>('');
  const [ethToSwapSlippage, setEthToSwapSlippage] = useState<string>('');

  const [depositSpc, setDepositSpc] = useState<string>('');
  const [depositEth, setDepositEth] = useState<string>('');

  const [withdrawSpcEth, setWithdrawSpcEth] = useState<string>('');

  const balance = useGetBalance();
  const numberOfSpcTokens = useGetScaledNumberOfSpcTokens();
  const numberOfSpcEthTokens = useGetScaledNumberOfSpcEthTokens();

  const reserves = useGetReserves();

  // pulled from solidity, should actually query the contracts in production
  const getAmountOut = (amountIn?: BigNumber, reserveIn?: BigNumber, reserveOut?: BigNumber) => {
    if (!amountIn || !reserveIn || !reserveOut) {
      return BigNumber.from(0);
    }
    const amountInWithFee = amountIn.mul(99); // 1% of trade
    return amountInWithFee.mul(reserveOut).div(reserveIn.mul(100).add(amountInWithFee));
  };

  const investInIco = useInvestInIco();
  const claimTokens = useClaimTokens();

  const deposit = useDeposit();
  const withdraw = useWithdraw();

  const swapSpcForEth = useSwapSPCForETH();
  const swapEthForSpc = useSwapETHForSPC();

  const onSubmitInvest = async () => {
    await investInIco(ethers.utils.parseEther(ethInvest));
  };

  const onSubmitDeposit = async () => {
    await deposit(ethers.utils.parseEther(depositSpc), ethers.utils.parseEther(depositEth));
  };

  const onSubmitWithdraw = async () => {
    await withdraw(ethers.utils.parseEther(withdrawSpcEth));
  };

  const onSubmitSpcToEthSwap = async () => {
    await swapSpcForEth(
      ethers.utils.parseEther(spcToSwap),
      ethers.utils.parseEther(spcToSwapSlippage)
    );
  };

  const onSubmitEthToSpcSwap = async () => {
    await swapEthForSpc(
      ethers.utils.parseEther(ethToSwap),
      ethers.utils.parseEther(ethToSwapSlippage)
    );
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>SpaceToken ICO</title>
        <meta name="description" content="SpaceToken ICO" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          Welcome to <br /> <a>SpaceToken</a>
        </h1>

        <p className={styles.description}>
          Network: <code className={styles.code}>{wallet.networkName ?? 'Error'}</code>
          <br />
          Current Address: <code className={styles.code}>{wallet.account ?? 'Error'}</code>
          <br />
          ETH Balance:{' '}
          <code className={styles.code}>~{balance ? balance.toNumber() / 100 : 'Error'}</code>
          <br />
          Number of SPC tokens:{' '}
          <code className={styles.code}>
            ~{numberOfSpcTokens ? numberOfSpcTokens.toNumber() / 100 : 'Error'}
          </code>
          <br />
          Number of SPC-ETH tokens:{' '}
          <code className={styles.code}>
            ~{numberOfSpcEthTokens ? numberOfSpcEthTokens.toNumber() / 100 : 'Error'}
          </code>
        </p>

        <label>
          Amount ETH to Invest:
          <input type="number" value={ethInvest} onChange={(e) => setEthInvest(e.target.value)} />
        </label>
        <input type="submit" value="Invest in ICO" onClick={onSubmitInvest} />

        <br />

        <button onClick={() => claimTokens()}>Claim Tokens from ICO</button>

        <hr style={{ margin: 20, width: '100%' }} />

        <h2>Deposit/Withdraw from LP</h2>

        <label>
          Amount SPC to Deposit:
          <input type="number" value={depositSpc} onChange={(e) => setDepositSpc(e.target.value)} />
        </label>
        <label>
          Amount ETH to Deposit:
          <input type="number" value={depositEth} onChange={(e) => setDepositEth(e.target.value)} />
        </label>
        <input type="submit" value="Deposit" onClick={onSubmitDeposit} />

        <br />
        <br />

        <label>
          Amount SPC-ETH (liquidity) to Withdraw:
          <input
            type="number"
            value={withdrawSpcEth}
            onChange={(e) => setWithdrawSpcEth(e.target.value)}
          />
        </label>
        <input type="submit" value="Withdraw" onClick={onSubmitWithdraw} />

        <hr style={{ margin: 20, width: '100%' }} />

        <h2>Swap ETH to/from SPC</h2>

        <label>
          SPC to Swap:
          <input type="number" value={spcToSwap} onChange={(e) => setSpcToSwap(e.target.value)} />
        </label>
        <label>
          Minimum ETH (slippage):
          <input
            type="number"
            value={spcToSwapSlippage}
            onChange={(e) => setSpcToSwapSlippage(e.target.value)}
          />
        </label>
        <label>
          {getAmountOut(ethers.utils.parseEther(spcToSwap || '0'), reserves?.[0], reserves?.[1])
            ?.div(BigNumber.from(10).pow(16))
            .toNumber() / 100}
        </label>
        <input type="submit" value="Swap" onClick={onSubmitSpcToEthSwap} />

        <br />
        <br />

        <label>
          ETH to Swap:
          <input type="number" value={ethToSwap} onChange={(e) => setEthToSwap(e.target.value)} />
        </label>
        <label>
          Minimum SPC (slippage):
          <input
            type="number"
            value={ethToSwapSlippage}
            onChange={(e) => setEthToSwapSlippage(e.target.value)}
          />
        </label>
        <label>
          {getAmountOut(ethers.utils.parseEther(ethToSwap || '0'), reserves?.[1], reserves?.[0])
            ?.div(BigNumber.from(10).pow(16))
            .toNumber() / 100}
        </label>
        <input type="submit" value="Swap" onClick={onSubmitEthToSpcSwap} />
      </main>
    </div>
  );
};

export default Home;
