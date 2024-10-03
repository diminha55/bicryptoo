import { ethers } from "ethers";
import { fromBigInt } from "./blockchain";
import { estimateGas, getAdjustedGasPrice } from "./gas";
import { getTokenContractAddress } from "./tokens";
import { decrypt } from "../encrypt";
import { models, sequelize } from "@b/db";
import { getSmartContract } from "./smartContract";
import { getChainId, getTimestampInSeconds } from "./chains";
import { Op } from "sequelize";
import {
  getActiveCustodialWallets,
  getCustodialWalletContract,
  getCustodialWalletTokenBalance,
} from "./custodialWallet";
import { ecosystemMasterWalletAttributes } from "@db/ecosystemMasterWallet";
import { walletAttributes } from "@db/wallet";

export const walletResponseAttributes = [
  "id",
  "currency",
  "chain",
  "address",
  "status",
  "balance",
];

// Fetch a master wallet by chain with select attributes
export async function getMasterWalletByChain(
  chain: string
): Promise<ecosystemMasterWalletAttributes | null> {
  return models.ecosystemMasterWallet.findOne({
    where: { chain },
    attributes: walletResponseAttributes,
  });
}

// Fetch a master wallet by chain (no select constraint)
export async function getMasterWalletByChainFull(
  chain: string
): Promise<ecosystemMasterWalletAttributes> {
  const wallet = await models.ecosystemMasterWallet.findOne({
    where: { chain },
  });

  if (!wallet) {
    throw new Error(`Master wallet not found for chain: ${chain}`);
  }

  return wallet;
}

// Check if there are enough funds for the withdrawal
export async function checkEcosystemAvailableFunds(
  userWallet,
  walletData,
  totalAmount
) {
  try {
    const totalAvailable = await getTotalAvailable(userWallet, walletData);

    if (totalAvailable < totalAmount)
      throw new Error("Insufficient funds for withdrawal including fee");

    return totalAvailable;
  } catch (error) {
    console.error(`Failed to check available funds: ${error.message}`);
    throw new Error("Withdrawal failed - please try again later");
  }
}

// Get total available balance
const getTotalAvailable = async (userWallet, walletData) => {
  const pvEntry = await models.ecosystemPrivateLedger.findOne({
    where: {
      walletId: userWallet.id,
      index: walletData.index,
      currency: userWallet.currency,
      chain: walletData.chain,
    },
  });
  return userWallet.balance + (pvEntry ? pvEntry.offchainDifference : 0);
};

export async function getGasPayer(chain, provider) {
  // Decrypt the master wallet data to get the private key
  const masterWallet = await getMasterWalletByChainFull(chain);
  if (!masterWallet) {
    console.error(`Master wallet for chain ${chain} not found`);
    throw new Error("Withdrawal failed - please try again later");
  }
  const { data } = masterWallet;
  if (!data) {
    console.error("Master wallet data not found");
    throw new Error("Withdrawal failed - please try again later");
  }

  const decryptedMasterData = JSON.parse(decrypt(data));
  if (!decryptedMasterData.privateKey) {
    console.error("Decryption failed - mnemonic not found");
    throw new Error("Withdrawal failed - please try again later");
  }

  // Initialize the admin wallet using the decrypted mnemonic
  try {
    return new ethers.Wallet(decryptedMasterData.privateKey, provider);
  } catch (error) {
    console.error(`Failed to initialize admin wallet: ${error.message}`);
    throw new Error("Withdrawal failed - please try again later");
  }
}

// Validate Ethereum address
export const validateAddress = (toAddress) => {
  if (!ethers.isAddress(toAddress)) {
    throw new Error(`Invalid target wallet address: ${toAddress}`);
  }
};

export const validateEcosystemBalances = async (
  tokenContract,
  actualTokenOwner,
  amount
) => {
  const tokenOwnerBalance = (
    await tokenContract.balanceOf(actualTokenOwner.address)
  ).toString();

  if (tokenOwnerBalance < amount) {
    throw new Error(`Insufficient funds in the wallet for withdrawal`);
  }

  return true;
};

// Get Token Owner
export const getEcosystemTokenOwner = (walletData, provider) => {
  const { data } = walletData;
  const decryptedData = JSON.parse(decrypt(data));
  if (!decryptedData.privateKey) {
    throw new Error(`Invalid private key`);
  }
  const { privateKey } = decryptedData;
  return new ethers.Wallet(privateKey, provider);
};

// Initialize Token Contracts
export const initializeContracts = async (chain, currency, provider) => {
  const { contractAddress, contractType, tokenDecimals } =
    await getTokenContractAddress(chain, currency);
  const gasPayer = await getGasPayer(chain, provider);
  const { abi } = await getSmartContract("token", "ERC20");
  const contract = new ethers.Contract(contractAddress, abi, provider);

  return {
    contract,
    contractAddress,
    gasPayer,
    contractType,
    tokenDecimals,
  };
};

// Perform TransferFrom Transaction
export const executeEcosystemWithdrawal = async (
  tokenContract,
  tokenContractAddress,
  gasPayer,
  tokenOwner,
  toAddress,
  amount,
  provider
) => {
  const gasPrice = await getAdjustedGasPrice(provider);
  const transferFromTransaction = {
    to: tokenContractAddress,
    from: gasPayer.address,
    data: tokenContract.interface.encodeFunctionData("transferFrom", [
      tokenOwner.address,
      toAddress,
      amount,
    ]),
  };

  const gasLimitForTransferFrom = await estimateGas(
    transferFromTransaction,
    provider
  );

  const trx = await tokenContract
    .connect(gasPayer)
    .getFunction("transferFrom")
    .send(tokenOwner.address, toAddress, amount, {
      gasPrice: gasPrice,
      gasLimit: gasLimitForTransferFrom,
    });

  await trx.wait(2);

  return trx;
};

// Perform TransferFrom Transaction
export const executeNoPermitWithdrawal = async (
  chain,
  tokenContractAddress,
  gasPayer,
  toAddress,
  amount: bigint,
  provider,
  isNative: boolean
) => {
  const custodialWallets = await getActiveCustodialWallets(chain);
  if (!custodialWallets || custodialWallets.length === 0) {
    throw new Error("No custodial wallets found");
  }

  let tokenOwner, custodialContract, custodialContractAddress;
  for (const custodialWallet of custodialWallets) {
    const custodialWalletContract = await getCustodialWalletContract(
      custodialWallet.address,
      provider
    );
    const balance = await getCustodialWalletTokenBalance(
      custodialWalletContract,
      tokenContractAddress
    );

    if (BigInt(balance) >= amount) {
      tokenOwner = custodialWallet;
      custodialContract = custodialWalletContract;
      custodialContractAddress = custodialWallet.address;
      break;
    }
  }
  if (!tokenOwner) {
    console.error(`No custodial wallets found for chain ${chain}`);
    throw new Error("No custodial wallets found");
  }

  let trx;
  if (isNative) {
    trx = await custodialContract
      .connect(gasPayer)
      .getFunction("transferNative")
      .send(toAddress, amount);
  } else {
    trx = await custodialContract
      .connect(gasPayer)
      .getFunction("transferTokens")
      .send(tokenContractAddress, toAddress, amount);
  }

  await trx.wait(2);

  return trx;
};

// Fetch and validate the actual token owner
export async function getAndValidateTokenOwner(
  walletData,
  amountEth,
  tokenContract,
  provider
) {
  let alternativeWalletUsed = false; // Initialize flag
  const tokenOwner = await getEcosystemTokenOwner(walletData, provider);
  let actualTokenOwner = tokenOwner;
  let alternativeWallet: any = null;

  // If on-chain balance is not sufficient, find an alternative wallet
  const onChainBalance = await tokenContract.balanceOf(tokenOwner.address);
  if (onChainBalance < amountEth) {
    const alternativeWalletData = await findAlternativeWalletData(
      walletData,
      fromBigInt(amountEth)
    );
    alternativeWallet = alternativeWalletData;
    actualTokenOwner = getEcosystemTokenOwner(alternativeWalletData, provider);
    alternativeWalletUsed = true; // Set flag to true
  }

  validateEcosystemBalances(tokenContract, actualTokenOwner, amountEth);

  return { actualTokenOwner, alternativeWalletUsed, alternativeWallet }; // Return the flag along with the actualTokenOwner
}

// Perform Permit Transaction
export const executePermit = async (
  tokenContract,
  tokenContractAddress,
  gasPayer,
  tokenOwner,
  amount,
  provider
) => {
  const nonce = await tokenContract.nonces(tokenOwner.address);
  const deadline = getTimestampInSeconds() + 4200;
  const domain: ethers.TypedDataDomain = {
    chainId: await getChainId(provider),
    name: await tokenContract.name(),
    verifyingContract: tokenContractAddress,
    version: "1",
  };

  // set the Permit type parameters
  const types = {
    Permit: [
      {
        name: "owner",
        type: "address",
      },
      {
        name: "spender",
        type: "address",
      },
      {
        name: "value",
        type: "uint256",
      },
      {
        name: "nonce",
        type: "uint256",
      },
      {
        name: "deadline",
        type: "uint256",
      },
    ],
  };

  // set the Permit type values
  const values = {
    owner: tokenOwner.address,
    spender: gasPayer.address,
    value: amount,
    nonce: nonce,
    deadline: deadline,
  };

  const signature = await tokenOwner.signTypedData(domain, types, values);
  const sig = ethers.Signature.from(signature);

  const recovered = ethers.verifyTypedData(domain, types, values, sig);
  if (recovered !== tokenOwner.address) {
    throw new Error(`Invalid signature`);
  }

  const gasPrice = await getAdjustedGasPrice(provider);

  const permitTransaction = {
    to: tokenContractAddress,
    from: tokenOwner.address,
    nonce: nonce,
    data: tokenContract.interface.encodeFunctionData("permit", [
      tokenOwner.address,
      gasPayer.address,
      amount,
      deadline,
      sig.v,
      sig.r,
      sig.s,
    ]),
  };

  const gasLimitForPermit = await estimateGas(permitTransaction, provider);

  const gasPayerBalance = (
    await tokenContract.balanceOf(gasPayer.address)
  ).toString();
  if (
    BigInt(gasPayerBalance) <
    BigInt(gasLimitForPermit) * gasPrice * BigInt(2)
  ) {
    // TODO: Add a notification to the admin about how much missing gas he needs to add to the wallet
    throw new Error(`Withdrawal failed, Please contact support team.`);
  }

  const tx = await tokenContract
    .connect(gasPayer)
    .getFunction("permit")
    .send(
      tokenOwner.address,
      gasPayer.address,
      amount,
      deadline,
      sig.v,
      sig.r,
      sig.s,
      {
        gasPrice: gasPrice,
        gasLimit: gasLimitForPermit,
      }
    );

  await tx.wait(2);

  return tx;
};

export const executeNativeWithdrawal = async (
  payer,
  toAddress,
  amount,
  provider
) => {
  // Check gasPayer balance
  const balance = await provider.getBalance(payer.address);
  if (balance < amount) {
    throw new Error(`Insufficient funds for withdrawal`);
  }

  // Create transaction object
  const tx = {
    to: toAddress,
    value: amount,
  };

  // Send transaction
  const response = await payer.sendTransaction(tx);
  await response.wait(2);

  return response;
};

// Fetch and validate the actual token owner
export async function getAndValidateNativeTokenOwner(
  walletData,
  amountEth,
  provider
) {
  const tokenOwner = await getEcosystemTokenOwner(walletData, provider);

  // If on-chain balance is not sufficient, find an alternative wallet
  const onChainBalance = await provider.getBalance(tokenOwner.address);
  if (onChainBalance < amountEth) {
    throw new Error(`Insufficient funds in the wallet for withdrawal`);
  }

  return tokenOwner;
}

export async function getWalletData(walletId: string, chain: string) {
  return models.walletData.findOne({
    where: {
      walletId: walletId,
      chain: chain,
    },
  });
}

export async function findAlternativeWalletData(walletData, amount) {
  const alternativeWalletData = await models.walletData.findOne({
    where: {
      currency: walletData.currency,
      chain: walletData.chain,
      balance: {
        [Op.gte]: amount,
      },
    },
  });

  if (!alternativeWalletData) {
    throw new Error("No alternative wallet with sufficient balance found");
  }

  return alternativeWalletData;
}

export async function getEcosystemPendingTransactions() {
  return models.transaction.findAll({
    where: {
      type: "WITHDRAW",
      status: "PENDING",
    },
    include: [{ model: models.wallet, where: { type: "ECO" } }],
  });
}

export const handleEcosystemDeposit = async (trx) => {
  const transaction = await models.transaction.findOne({
    where: {
      referenceId: trx.hash,
    },
  });

  if (transaction) {
    throw new Error("Transaction already processed");
  }

  const wallet = await models.wallet.findOne({
    where: { id: trx.id },
  });

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  // Parse the wallet address JSON
  const addresses = JSON.parse(wallet.address as any);

  // Get the address for the specific chain
  const chainAddress = addresses[trx.chain];
  if (!chainAddress) {
    throw new Error("Address not found for the given chain");
  }

  // Update the balance of the specific chain address
  chainAddress.balance = (chainAddress.balance || 0) + parseFloat(trx.amount);

  // Update the overall wallet balance
  const walletBalance = wallet.balance + parseFloat(trx.amount);

  await models.wallet.update(
    {
      balance: walletBalance,
      address: JSON.stringify(addresses) as any,
    },
    {
      where: { id: wallet.id },
    }
  );

  const createdTransaction = await models.transaction.create({
    userId: wallet.userId,
    walletId: wallet.id,
    type: "DEPOSIT",
    status: trx.status,
    amount: parseFloat(trx.amount),
    description: `Deposit of ${trx.amount} ${wallet.currency} from ${trx.from}`,
    referenceId: trx.hash,
    fee: parseFloat(trx.gasUsed) * parseFloat(trx.gasPrice),
    metadata: JSON.stringify({
      chain: trx.chain,
      currency: wallet.currency,
      gasLimit: trx.gasLimit,
      gasPrice: trx.gasPrice,
      gasUsed: trx.gasUsed,
    }),
  });

  const updatedWallet = await models.wallet.findOne({
    where: { id: wallet.id },
  });

  await models.walletData.update(
    {
      balance: sequelize.literal(`balance + ${trx.amount}`),
    },
    {
      where: {
        walletId: wallet.id,
        chain: trx.chain,
      },
    }
  );

  return {
    transaction: createdTransaction,
    wallet: updatedWallet,
  };
};

export async function updatePrivateLedger(
  wallet_id,
  index,
  currency,
  chain,
  difference
) {
  const networkValue = process.env[`${chain}_NETWORK`];

  // Create the unique identifier based on your unique constraint or primary key
  const uniqueIdentifier = {
    walletId: wallet_id,
    index: index,
    currency: currency,
    chain: chain,
    network: networkValue,
  };

  // Attempt to find the existing record
  const existingLedger = await models.ecosystemPrivateLedger.findOne({
    where: uniqueIdentifier,
  });

  // If it exists, update it
  if (existingLedger) {
    await models.ecosystemPrivateLedger.update(
      {
        offchainDifference: sequelize.literal(
          `offchain_difference + ${difference}`
        ),
      },
      {
        where: uniqueIdentifier,
      }
    );
    return existingLedger; // Return the updated record or handle as needed
  }

  // If it does not exist, create it
  else {
    return models.ecosystemPrivateLedger.create({
      walletId: wallet_id,
      index: index,
      currency: currency,
      chain: chain,
      offchainDifference: difference,
      network: networkValue,
    });
  }
}
const updateBalancePrecision = (balance, chain) => {
  // Chains that require fixed decimal precision
  const fixedPrecisionChains = ["BTC", "LTC", "DOGE", "DASH"];
  if (fixedPrecisionChains.includes(chain)) {
    return parseFloat(balance.toFixed(8));
  }
  return balance;
};

export const decrementWalletBalance = async (userWallet, chain, amount) => {
  try {
    // Calculate the new balance
    let newBalance = userWallet.balance - amount;
    newBalance = updateBalancePrecision(newBalance, chain);

    // Safely parse the stored addresses JSON
    const addresses = JSON.parse(userWallet.address);
    if (addresses[chain]) {
      addresses[chain].balance = updateBalancePrecision(
        addresses[chain].balance - amount,
        chain
      );
    } else {
      throw new Error(
        `Chain ${chain} not found in the user's wallet addresses.`
      );
    }

    // Update the wallet in the database
    await models.wallet.update(
      {
        balance: newBalance,
        address: JSON.stringify(addresses) as any,
      },
      {
        where: { id: userWallet.id },
      }
    );
  } catch (error) {
    console.error("Failed to decrement wallet balance:", error);
    throw error; // Re-throw the error after logging it
  }
};

export async function createPendingTransaction(
  userId,
  walletId,
  currency,
  chain,
  amount,
  toAddress,
  withdrawalFee
) {
  return models.transaction.create({
    userId: userId,
    walletId: walletId,
    type: "WITHDRAW",
    status: "PENDING",
    amount: amount,
    fee: withdrawalFee,
    description: `Pending withdrawal of ${amount} ${currency} to ${toAddress}`,
    metadata: JSON.stringify({
      toAddress: toAddress,
      chain: chain,
    }),
  });
}

export const refundUser = async (transaction) => {
  await models.transaction.update(
    {
      status: "FAILED",
      description: `Refund of ${transaction.amount}`,
    },
    {
      where: { id: transaction.id },
    }
  );

  const wallet = await models.wallet.findOne({
    where: { id: transaction.walletId },
  });

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  const metadata = JSON.parse(transaction.metadata);
  const addresses = JSON.parse(wallet.address as any);
  const amount = transaction.amount + transaction.fee;
  if (metadata?.chain && addresses[metadata?.chain]) {
    addresses[metadata?.chain].balance += amount;
  }
  const walletBalance = wallet.balance + amount;

  await models.wallet.update(
    {
      balance: walletBalance,
      address: JSON.stringify(addresses) as any,
    },
    {
      where: { id: wallet.id },
    }
  );
};

export const updateAlternativeWallet = async (currency, chain, amount) => {
  const alternativeWalletData = await models.walletData.findOne({
    where: {
      currency: currency,
      chain: chain,
    },
  });

  if (!alternativeWalletData) {
    throw new Error("Alternative wallet not found");
  }

  await models.walletData.update(
    {
      balance: sequelize.literal(`balance - ${amount}`),
    },
    {
      where: { id: alternativeWalletData.id },
    }
  );

  await updatePrivateLedger(
    alternativeWalletData.walletId,
    alternativeWalletData.index,
    currency,
    chain,
    -amount
  );
};

export async function updateWalletBalance(
  wallet: walletAttributes,
  balanceChange: number,
  type: "add" | "subtract"
): Promise<void> {
  if (!wallet) throw new Error("Wallet not found");

  let newBalance: number;

  // Function to round to 4 decimal places
  const roundTo4DecimalPlaces = (num: number) =>
    Math.round((num + Number.EPSILON) * 1e8) / 1e8;

  switch (type) {
    case "add":
      newBalance = roundTo4DecimalPlaces(wallet.balance + balanceChange);
      break;
    case "subtract":
      newBalance = roundTo4DecimalPlaces(wallet.balance - balanceChange);
      if (newBalance < 0) {
        throw new Error("Insufficient funds");
      }
      break;
    default:
      throw new Error("Invalid type specified for updating wallet balance.");
  }

  await models.wallet.update(
    {
      balance: newBalance,
    },
    {
      where: { id: wallet.id },
    }
  );
}

export async function getWalletByUserIdAndCurrency(
  userId: string,
  currency: string
): Promise<walletAttributes> {
  const wallet = await models.wallet.findOne({
    where: {
      userId,
      currency,
      type: "ECO",
    },
  });

  if (!wallet) {
    throw new Error(
      `Wallet not found for user ID: ${userId} and currency: ${currency}`
    );
  }

  return wallet;
}
