import { config as dotEnvConfig } from 'dotenv';
dotEnvConfig({ path: './.env' });

import { HardhatUserConfig } from 'hardhat/types';

import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
import '@nomiclabs/hardhat-etherscan';
import '@openzeppelin/hardhat-upgrades';
import 'solidity-coverage';
import 'hardhat-contract-sizer';

// set random default private key if env doesn't exist
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const INFURA_PROJECT_ID = process.env.INFURA_PROJECT_ID;

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  solidity: {
    compilers: [{ version: '0.8.7', settings: {} }]
  },
  networks: {
    hardhat: {
      accounts: {
        // default to 100,000 ETH for this project
        accountsBalance: '100000000000000000000000',
        // default to 30 for this project
        count: 40
      }
    },
    localhost: {},
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${INFURA_PROJECT_ID}`
      // accounts: [`${PRIVATE_KEY}`]
    }
  },
  typechain: {
    outDir: './frontend/types'
  }
};

export default config;
