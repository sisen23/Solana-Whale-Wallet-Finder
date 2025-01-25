# FirstBuyerSpread Project

This project is designed to process, categorize, and analyze blockchain transactions. It includes functionalities for fetching and processing transaction details, aggregating data, and generating insights. The code is divided into two parts for modularity and scalability. The current log files are examples of the outputted files.

## Features
- Fetch transactions from the Solana blockchain using an RPC endpoint.
- Categorize transactions into protocols such as Raydium, Jupiter, and Pump.fun.
- Decode and process transaction details.
- Fetch token balances for specific wallet addresses.
- Calculate stablecoin and SOL balances.
- Filter and prioritize accounts based on token balances.
- Append results to structured output files for further analysis.
- Fetch historical mint prices and integrate them into account data.
- You can change the mint address to find data for any token.
- You can also change the timeframe to to search for any wallets on specific times.
- Outputs multiple files for categorized transactions from different platoforms.
- The final output file gives overall buying stats for current mint and total wallet balance.

---

## Files Overview

### 1. `FirstBuyerSpread.mjs`
- **Purpose**: Core script for fetching transactions, categorizing them, and passing the processed data for further analysis.
- **Key Functionalities**:
  - Fetch transaction signatures using `getSignaturesForAddress`.
  - Fetch transaction details using `getTransaction`.
  - Categorize transactions based on log messages into Jupiter, Raydium, Pump.fun, or Unknown.
  - Process categorized transactions using modular functions.
  - Aggregate all processed transactions and save the results into structured JSON files.
- **Dependencies**:
  - Axios (for HTTP requests)
  - dotenv (for managing environment variables)
  - File system module (for reading and writing logs)

### 2. `FirstBuyerSpreadPart2Git.mjs`
- **Purpose**: Handles detailed analysis and filtering of wallet data, including token balances and SOL balances.
- **Key Functionalities**:
  - Fetch token accounts owned by a specific wallet.
  - Fetch the SOL balance of a wallet.
  - Filter accounts based on specific conditions (e.g., mandatory mints, high token balances).
  - Append results to structured JSON files for further use.
  - Fetch historical mint prices and update account details with price and total price data.
  - Calculate aggregated values, such as total SPL balance, stablecoin balance, and SOL balance.
- **Dependencies**:
  - dotenv (for managing environment variables)
  - File system module (for reading and writing logs)

---

## Output Files
The processed data is saved in the `logs` directory:
- `FirstBuyerSpreadOutput2.json`: Categorized transaction details.
- `FirstBuyerSpreadRaydiumProcessed.json`: Processed Raydium transactions.
- `FirstBuyerSpreadPumpFunProcessed.json`: Processed Pump.fun transactions.
- `FirstBuyerSpreadJupiterProcessed.json`: Processed Jupiter transactions.
- `FirstBuyerSpreadUnknownTransactions.json`: Unclassified transactions.
- `FirstBuyerSpreadAggregatedTransactions.json`: Aggregated results from all protocols.
- `FirstBuyerSpreadPart2Output.json`: Wallet analysis results, including balances and account details.

---

## Notes
- The scripts include rate limiting and exponential backoff to handle RPC rate limits.
- Ensure sufficient RPC quota for large-scale transaction processing.
- The scripts are modular, allowing for future integration with other protocols or improvements in transaction categorization.

---

