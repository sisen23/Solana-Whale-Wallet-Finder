import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const RPC_URL = process.env.RPC_URL;
if (!RPC_URL) {
    console.error('Error: RPC_URL is not defined. Check your .env file.');
    process.exit(1);
}

const logsDir = path.resolve(__dirname, '../logs');

// Create the logs folder if it doesn't exist
await fs.promises.mkdir(logsDir, { recursive: true });


const RATE_LIMIT = 30;
const outputFilePath = path.join(logsDir, 'FirstBuyerSpreadPart2Output.json');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchTokenAccountsByOwner(owner) {
    const payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [
            owner,
            { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
            { encoding: "jsonParsed" }
        ]
    };

    try {
        const response = await fetch(RPC_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`Error fetching token accounts for owner ${owner}:`, response.statusText);
            return null;
        }

        const data = await response.json();
        return data.result.value || [];
    } catch (error) {
        console.error(`Error fetching token accounts for owner ${owner}:`, error.message);
        return null;
    }
}

async function fetchSolBalance(owner) {
    const payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [owner]
    };

    try {
        const response = await fetch(RPC_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`Error fetching SOL balance for owner ${owner}:`, response.statusText);
            return null;
        }

        const data = await response.json();
        const lamports = data.result?.value || 0;
        return lamports / 1e9; // Convert lamports to SOL
    } catch (error) {
        console.error(`Error fetching SOL balance for owner ${owner}:`, error.message);
        return null;
    }
}

async function appendResultsToFile(ownerInfo, accounts, solBalance) {
    try {
        let existingData = [];

        try {
            const fileData = await fs.promises.readFile(outputFilePath, 'utf-8'); // Use promises API
            existingData = JSON.parse(fileData);
        } catch (readError) {
            if (readError.code !== 'ENOENT') throw readError;
        }

        let mintAmount = 0;
        const mandatoryMints = [
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
            "So11111111111111111111111111111111111111112"
        ];

        const filteredAccounts = accounts.filter(account => {
            const mint = account.account.data.parsed.info.mint;
            const amount = parseFloat(account.account.data.parsed.info.tokenAmount.amount);
            const decimals = account.account.data.parsed.info.tokenAmount.decimals;
            const uiAmount = amount / Math.pow(10, decimals);

            if (mandatoryMints.includes(mint)) {
                mintAmount += uiAmount;
                return true;
            }

            if (mint === "4gJSf4q3VXwoKH7ScrYCxHBN41eWwPYJW3aNykYrpump") {
                mintAmount += uiAmount;
                return true;
            }

            return uiAmount >= 20000;
        }).map(account => {
            const mint = account.account.data.parsed.info.mint;
            const owner = account.account.data.parsed.info.owner;
            const amount = parseFloat(account.account.data.parsed.info.tokenAmount.amount) / Math.pow(10, account.account.data.parsed.info.tokenAmount.decimals);
            return {
                mint,
                owner,
                amount,
                price: null,
                TotalPrice: null
            };
        });

        const topAccounts = filteredAccounts
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 20);

        let ownerEntry = existingData.find(entry => entry.owner === ownerInfo.owner);
        if (!ownerEntry) {
            ownerEntry = {
                ...ownerInfo,
                CurrentAmount: 0,
                SOLbalance: solBalance,
                TotalSOLBalance: 0,
                TotalStables: 0,
                TotalSPL: 0,
                accounts: []
            };
            existingData.push(ownerEntry);
        }

        ownerEntry.CurrentAmount = (ownerEntry.CurrentAmount || 0) + mintAmount;
        ownerEntry.SOLbalance = solBalance;
        ownerEntry.accounts = topAccounts;

        const solMintAccount = ownerEntry.accounts.find(account => account.mint === "So11111111111111111111111111111111111111112");
        const solMintBalance = solMintAccount ? solMintAccount.amount : 0;
        ownerEntry.TotalSOLBalance = solBalance + solMintBalance;

        ownerEntry.TotalStables = ownerEntry.accounts
            .filter(account => ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"].includes(account.mint))
            .reduce((sum, account) => sum + account.amount, 0);

        ownerEntry.TotalSPL = ownerEntry.accounts
            .filter(account => account.TotalPrice !== null && !mandatoryMints.includes(account.mint))
            .reduce((sum, account) => sum + account.TotalPrice, 0);

        if (!solMintAccount) {
            ownerEntry.accounts.push({
                mint: "So11111111111111111111111111111111111111112",
                owner: ownerInfo.owner,
                amount: solBalance,
                price: null,
                TotalPrice: null
            });
        }

        ownerEntry.accounts.forEach(account => {
            if (account.amount !== null && account.price !== null) {
                account.TotalPrice = parseFloat(account.amount) * parseFloat(account.price);
            }
        });

        const reorderedData = existingData.map(entry => {
            const { CurrentAmount, SOLbalance, TotalSOLBalance, TotalStables, TotalSPL, ...rest } = entry;
            return {
                owner: entry.owner,
                CurrentAmount,
                SOLbalance,
                TotalSOLBalance,
                TotalStables,
                TotalSPL,
                ...rest
            };
        });

        await fs.promises.writeFile(outputFilePath, JSON.stringify(reorderedData, null, 2)); // Use promises API
        console.log(`Data for owner ${ownerInfo.owner} has been updated.`);
    } catch (error) {
        console.error(`Error appending data for owner ${ownerInfo.owner}:`, error.message);
    }
}



async function calculateTotalSPL() {
    try {
        const fileContent = await fs.promises.readFile(outputFilePath, 'utf-8');
        const data = JSON.parse(fileContent);

        const excludedMints = ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", "So11111111111111111111111111111111111111112"];

        data.forEach(ownerEntry => {
            const totalSPL = ownerEntry.accounts
                .filter(account => account.TotalPrice !== null && !excludedMints.includes(account.mint))
                .reduce((sum, account) => sum + account.TotalPrice, 0);

            ownerEntry.TotalSPL = totalSPL;
        });

        await fs.promises.writeFile(outputFilePath, JSON.stringify(data, null, 2)); // Use fs.promises.writeFile
        console.log('TotalSPL field has been calculated and updated.');
    } catch (error) {
        console.error('Error calculating TotalSPL:', error.message);
    }
}

async function fetchMintPrices() {
    try {
        const fileContent = await fs.promises.readFile(outputFilePath, 'utf-8'); // Use fs.promises.readFile
        const data = JSON.parse(fileContent);

        const mints = [...new Set(data.flatMap(entry => entry.accounts?.map(acc => acc.mint) || []))];
        console.log(`Found ${mints.length} unique mint addresses.`);

        const results = [];
        const batchSize = 100;
        const delayMs = 1000;

        for (let i = 0; i < mints.length; i += batchSize) {
            const batch = mints.slice(i, i + batchSize);
            const ids = batch.join(',');
            const url = `https://api.jup.ag/price/v2?ids=${ids}`;

            try {
                const response = await fetch(url);
                if (!response.ok) {
                    console.error(`Error fetching prices for batch: ${response.statusText}`);
                    continue;
                }
                const rawData = await response.json();
                batch.forEach(mint => {
                    const price = rawData.data[mint]?.price || null;
                    results.push({ mint, price });
                });
            } catch (error) {
                console.error(`Network error fetching prices for batch:`, error);
            }

            if (i + batchSize < mints.length) {
                await sleep(delayMs);
            }
        }

        const priceMap = Object.fromEntries(results.map(({ mint, price }) => [mint, price]));

        data.forEach(entry => {
            entry.accounts?.forEach(account => {
                account.price = priceMap[account.mint] || null;
                if (account.amount !== null && account.price !== null) {
                    account.TotalPrice = parseFloat(account.amount) * parseFloat(account.price);
                }
            });
        });

        await fs.promises.writeFile(outputFilePath, JSON.stringify(data, null, 2)); // Use fs.promises.writeFile
        console.log(`Mint prices have been merged into the output file.`);
    } catch (error) {
        console.error('Error fetching mint prices:', error.message);
    }
}


export async function processTransactions(transactions) {
    try {
        const ownerData = {};

        transactions.forEach(transaction => {
            const { action, outputAmount, inputAmount, owner } = transaction;

            if (!ownerData[owner]) {
                ownerData[owner] = {
                    totalBuys: 0,
                    totalSells: 0,
                    totalBuyAmount: 0,
                    totalSellAmount: 0,
                    netTokenAmount: 0
                };
            }

            if (action === 'BUY') {
                ownerData[owner].totalBuys++;
                ownerData[owner].totalBuyAmount += parseFloat(outputAmount);
                ownerData[owner].netTokenAmount += parseFloat(outputAmount);
            } else if (action === 'SELL') {
                ownerData[owner].totalSells++;
                ownerData[owner].totalSellAmount += parseFloat(inputAmount);
                ownerData[owner].netTokenAmount -= parseFloat(inputAmount);
            }
        });

        const filteredOwners = Object.entries(ownerData)
            .filter(([_, data]) => data.netTokenAmount >= 2_000_000)
            .map(([owner, data]) => ({ owner, ...data }));

        console.log("Filtered owners:", filteredOwners);

        for (const ownerInfo of filteredOwners) {
            console.log(`Fetching token accounts for owner: ${ownerInfo.owner}`);
            const accounts = await fetchTokenAccountsByOwner(ownerInfo.owner);
            const solBalance = await fetchSolBalance(ownerInfo.owner);

            if (accounts) {
                await appendResultsToFile(ownerInfo, accounts, solBalance);
            }

            await sleep(1000 / RATE_LIMIT);
        }

        await fetchMintPrices();
        await calculateTotalSPL();
    } catch (error) {
        console.error('Error processing transactions:', error);
    }
}

