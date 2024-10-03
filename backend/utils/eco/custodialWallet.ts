import { ContractFactory, ethers, isError } from "ethers";
import { getSmartContract } from "./smartContract";
import { getProvider } from "./provider";
import { decrypt } from "../encrypt";
import { getAdjustedGasPrice } from "./gas";
import { ecosystemCustodialWalletAttributes } from "@db/ecosystemCustodialWallet";
import { models } from "@b/db";

export async function getCustodialWalletBalances(
  contract,
  tokens,
  format: boolean = true
) {
  const tokensAddresses = tokens.map((token) => token.contract);
  const [nativeBalance, tokenBalances] = await contract.getAllBalances(
    tokensAddresses
  );
  const balances = tokenBalances.map((balance, index) => ({
    ...tokens[index],
    balance: format
      ? ethers.formatUnits(balance, tokens[index].decimals)
      : balance,
  }));

  const native = format ? ethers.formatEther(nativeBalance) : nativeBalance;
  return { balances, native };
}

export async function getCustodialWalletTokenBalance(
  contract,
  tokenContractAddress
) {
  return await contract.getTokenBalance(tokenContractAddress);
}

export async function getCustodialWalletNativeBalance(contract) {
  return await contract.getNativeBalance();
}

export async function getCustodialWalletContract(
  address: string,
  provider: any
) {
  const { abi } = await getSmartContract("wallet", "CustodialWalletERC20");
  if (!abi) {
    throw new Error("Smart contract ABI or Bytecode not found");
  }

  return new ethers.Contract(address, abi, provider);
}

export async function deployCustodialContract(
  masterWallet: EcosystemMasterWallet
): Promise<string | undefined> {
  try {
    const provider = await getProvider(masterWallet.chain);
    if (!provider) {
      throw new Error("Provider not initialized");
    }

    // Decrypt mnemonic
    let decryptedData;
    try {
      decryptedData = JSON.parse(decrypt(masterWallet.data));
    } catch (error) {
      throw new Error(`Failed to decrypt mnemonic: ${error.message}`);
    }
    if (!decryptedData || !decryptedData.privateKey) {
      throw new Error("Decrypted data or Mnemonic not found");
    }
    const { privateKey } = decryptedData;

    // Create a signer
    const signer = new ethers.Wallet(privateKey).connect(provider);

    const { abi, bytecode } = await getSmartContract(
      "wallet",
      "CustodialWalletERC20"
    );
    if (!abi || !bytecode) {
      throw new Error("Smart contract ABI or Bytecode not found");
    }

    // Create Contract Factory
    const custodialWalletFactory = new ContractFactory(abi, bytecode, signer);

    // Fetch adjusted gas price
    const gasPrice = await getAdjustedGasPrice(provider);

    // Deploy the contract with dynamic gas settings
    const custodialWalletContract = await custodialWalletFactory.deploy(
      masterWallet.address,
      {
        gasPrice: gasPrice,
      }
    );

    // Wait for the contract to be deployed
    const response = await custodialWalletContract.waitForDeployment();

    return await response.getAddress();
  } catch (error: any) {
    if (isError(error, "INSUFFICIENT_FUNDS")) {
      // Specific handling for not enough funds
      throw new Error("Not enough funds to deploy the contract");
    }
    throw new Error(error.message);
  }
}

export async function getActiveCustodialWallets(
  chain
): Promise<ecosystemCustodialWalletAttributes[]> {
  const wallet = await models.ecosystemCustodialWallet.findAll({
    where: {
      chain: chain,
      status: true,
    },
  });

  if (!wallet) {
    throw new Error("No active custodial wallets found");
  }

  return wallet;
}
