// Import necessary modules
import axios from 'axios';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { processRaydiumTransactions } from './FirstBuyerSpreadRaydiumDecodeGit.mjs';
import { processTransactions } from './FirstBuyerSpreadJupiterDecode2Git.mjs';
import { decodeAndProcessPumpFunTransactions } from './FirstBuyerSpreadPumpfunDecodeGit.mjs';
import { processTransactions as processPart2Transactions } from './FirstBuyerSpreadPart2Git.mjs';

// Fix for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const endpoint = process.env.RPC_URL;
if (!endpoint) {
    console.error('Error: RPC_URL is not defined. Check your .env file.');
    process.exit(1);
}

const logsDir = path.resolve(__dirname, '../logs');

// Create the logs folder if it doesn't exist
const ensureLogsDir = async () => {
    try {
        await fs.mkdir(logsDir, { recursive: true });
    } catch (error) {
        console.error('Error ensuring logs directory exists:', error);
    }
};
await ensureLogsDir();

// Updated Output File Paths
const detailsOutputFilePath = path.join(logsDir, 'FirstBuyerSpreadOutput2.json');
const raydiumProcessedOutputFilePath = path.join(logsDir, 'FirstBuyerSpreadRaydiumProcessed.json');
const pumpFunOutputFilePath = path.join(logsDir, 'FirstBuyerSpreadPumpFunProcessed.json');
const unknownOutputFilePath = path.join(logsDir, 'FirstBuyerSpreadUnknownTransactions.json');
const jupiterProcessedOutputFilePath = path.join(logsDir, 'FirstBuyerSpreadJupiterProcessed.json');
const aggregatedOutputFilePath = path.join(logsDir, 'FirstBuyerSpreadAggregatedTransactions.json');

// Aggregated transactions array
const aggregatedTransactions = [];

// Hardcoded contract address
const contractAddress = '4gJSf4q3VXwoKH7ScrYCxHBN41eWwPYJW3aNykYrpump';

// Function to create a delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to handle rate-limited requests with exponential backoff
const fetchWithRetry = async (fetchFunction, args, retries = 5, initialDelay = 1000) => {
    let delayTime = initialDelay;
    for (let i = 0; i < retries; i++) {
        try {
            return await fetchFunction(...args);
        } catch (error) {
            if (error.response && error.response.status === 429) {
                console.warn(`Rate limit exceeded. Retrying in ${delayTime} ms...`);
                await delay(delayTime);
                delayTime *= 2; // Exponential backoff
            } else {
                throw error; // Rethrow other errors
            }
        }
    }
    throw new Error('Max retries reached');
};

// Function to fetch transactions for a given contract address
const fetchTransactions = async (contractAddress, before) => {
    const data = {
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [
            contractAddress,
            { limit: 1000, before: before },
        ],
    };

    const response = await axios.post(endpoint, data, {
        headers: { 'Content-Type': 'application/json' },
    });

    return response.data.result || [];
};

// Function to fetch transaction details for a given signature
const fetchTransactionDetails = async (signature) => {
    const data = {
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [
            signature,
            { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
        ],
    };

    const response = await axios.post(endpoint, data, {
        headers: { 'Content-Type': 'application/json' },
    });

    return response.data.result;
};

// Function to fetch transaction details with retry logic
const fetchTransactionDetailsWithRetry = async (signature, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fetchTransactionDetails(signature);
        } catch (error) {
            console.warn(`Retry ${i + 1} failed for ${signature}: ${error.message}`);
            await delay(1000); // Delay before retry
        }
    }
    console.error(`Failed to fetch details for ${signature} after ${retries} retries.`);
    return null; // Return null for failed fetches
};

// Function to write results to file
const writeToFile = async (filePath, data) => {
    try {
        await fs.writeFile(filePath, data + '\n', 'utf8');
    } catch (error) {
        console.error(`Error writing to file: ${filePath}`, error);
    }
};

// Categorize transactions
const categorizeTransaction = (logMessages) => {
    if (logMessages.some(msg => msg.includes('JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'))) return 'Jupiter';
    if (logMessages.some(msg => msg.includes('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'))) return 'Raydium';
    if (logMessages.some(msg => msg.includes('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'))) return 'Pump.fun';
    return 'Unknown';
};

// Fetch and categorize transaction details
const fetchAndCategorizeTransactionDetails = async (transactions, batchSize) => {
    const categories = { Jupiter: [], Raydium: [], 'Pump.fun': [], Unknown: [] };

    for (let i = 0; i < transactions.length; i += batchSize) {
        const batch = transactions.slice(i, i + batchSize);
        console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(transactions.length / batchSize)}`);

        const batchResults = await Promise.all(
            batch.map(async (tx) => {
                const detail = await fetchTransactionDetailsWithRetry(tx.signature);
                return detail; // Return null for failed fetches
            })
        );

        batchResults
            .filter(detail => detail !== null) // Exclude null results
            .forEach(detail => {
                const category = categorizeTransaction(detail.meta.logMessages || []);
                if (category === 'Jupiter') {
                    categories['Jupiter'].push(detail);
                } else if (category === 'Raydium') {
                    categories['Raydium'].push(detail);
                } else if (category === 'Pump.fun') {
                    categories['Pump.fun'].push(detail);
                } else {
                    categories['Unknown'].push(detail);
                }
            });

        await delay(1000); // Maintain 45 RPS
    }

    // Process Raydium transactions
    const processedRaydium = await processRaydiumTransactions(categories['Raydium']);
    if (Array.isArray(processedRaydium) && processedRaydium.length > 0) {
        await fs.writeFile(raydiumProcessedOutputFilePath, JSON.stringify(processedRaydium, null, 2));
        aggregatedTransactions.push(...processedRaydium);
    } else {
        console.warn('No Raydium transactions to process.');
    }

    // Process Pump.fun transactions
    const processedPumpFun = await decodeAndProcessPumpFunTransactions(categories['Pump.fun']);
    if (Array.isArray(processedPumpFun) && processedPumpFun.length > 0) {
        await fs.writeFile(pumpFunOutputFilePath, JSON.stringify(processedPumpFun, null, 2));
        aggregatedTransactions.push(...processedPumpFun);
    } else {
        console.warn('No Pump.fun transactions to process.');
    }

    // Process Jupiter transactions
    const processedJupiter = await processTransactions(categories['Jupiter']);
    if (Array.isArray(processedJupiter) && processedJupiter.length > 0) {
        await fs.writeFile(jupiterProcessedOutputFilePath, JSON.stringify(processedJupiter, null, 2));
        aggregatedTransactions.push(...processedJupiter);
    } else {
        console.warn('No Jupiter transactions to process.');
    }

    // Save aggregated transactions to file
    if (Array.isArray(aggregatedTransactions) && aggregatedTransactions.length > 0) {
        await fs.writeFile(aggregatedOutputFilePath, JSON.stringify(aggregatedTransactions, null, 2));
    } else {
        console.warn('No aggregated transactions to process.');
    }

    // Save unknown transactions
    if (Array.isArray(categories['Unknown']) && categories['Unknown'].length > 0) {
        await fs.writeFile(unknownOutputFilePath, JSON.stringify(categories['Unknown'], null, 2));
    } else {
        console.warn('No Unknown transactions to process.');
    }

    console.log(`Processed transactions saved to aggregated file: ${aggregatedOutputFilePath}`);
};

// Main function
const main = async () => {
    try {
        let allTransactions = [];
        let fetchMore = true;
        let before = null;

        while (fetchMore) {
            console.log(`Fetching transactions for ${contractAddress} with before=${before}`);
            const transactions = await fetchWithRetry(fetchTransactions, [contractAddress, before]);

            if (!transactions || transactions.length === 0) {
                console.log('No more transactions to fetch.');
                break;
            }

            allTransactions = allTransactions.concat(transactions);

            if (transactions.length < 1000) {
                console.log('Reached the last batch of transactions.');
                fetchMore = false;
            } else {
                before = transactions[transactions.length - 1].signature;
                await delay(1000); // Maintain 1 request per second
            }
        }

        const firstTransaction = allTransactions[allTransactions.length - 1];
        const cutoffTime = firstTransaction.blockTime + 1800;

        const filteredTransactions = allTransactions.filter(
            (tx) => tx.blockTime >= firstTransaction.blockTime &&
                    tx.blockTime <= cutoffTime &&
                    tx.err === null
        );

        console.log(`Total transactions fetched: ${allTransactions.length}`);
        console.log(`Filtered transactions (valid within 30 minutes, no errors): ${filteredTransactions.length}`);

        await fetchAndCategorizeTransactionDetails(filteredTransactions, 45);

        // Pass aggregated transactions to Part 2 processing
        console.log('Running Part 2 transaction processing...');
        await processPart2Transactions(aggregatedTransactions);
        console.log('Part 2 transaction processing completed.');
    } catch (error) {
        console.error('Error processing transactions:', error);
    }
};

main();
