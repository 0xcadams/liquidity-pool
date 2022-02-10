import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { UseWalletProvider } from 'use-wallet';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <UseWalletProvider autoConnect>
      <Component {...pageProps} />
    </UseWalletProvider>
  );
}

export default MyApp;
