import fs from "fs";
import { chainConfigs } from "./chains";

export async function getSmartContract(path, name) {
  const filePath = `${process.cwd()}/ecosystem/smart-contracts/${path}/${name}.json`;
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const contractJson = JSON.parse(fileContent);
    const { abi, bytecode } = contractJson;
    if (!bytecode || !abi)
      throw new Error(`Failed to extract bytecode or ABI for ${name}`);
    return { abi, bytecode };
  } catch (error) {
    console.error(`Failed to read contract JSON for ${name}: ${error.message}`);
    throw error;
  }
}

export const getContractAbi = async (
  chain: string,
  network: string,
  contractAddress: string
) => {
  const chainConfig = chainConfigs[chain];
  if (!chainConfig) {
    throw new Error(`Unsupported chain: ${chain}`);
  }

  const apiKey = process.env[`${chain}_EXPLORER_API_KEY`];
  if (!apiKey) {
    throw new Error(`API Key for ${chain} is not set`);
  }

  const networkConfig = chainConfig.networks[network];
  if (!networkConfig || !networkConfig.explorer) {
    throw new Error(`Unsupported network: ${network} for chain: ${chain}`);
  }

  const apiUrl = `https://${networkConfig.explorer}/api?module=contract&action=getabi&address=${contractAddress}&apikey=${apiKey}`;

  let data;
  try {
    const response = await fetch(apiUrl);
    data = await response.json();
  } catch (error) {
    throw new Error(`API call failed: ${error.message}`);
  }

  if (data.status !== "1") {
    throw new Error(`API Error: ${data.message}`);
  }

  return data.result;
};
