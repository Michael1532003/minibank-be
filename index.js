const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(bodyParser.json());
app.use(cors());

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'minibank',
    password: 'LoliLover7_',
    port: 5432,
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint for creating an account
app.post('/account', async (req, res) => {
    const { name, balance } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Generate the next account number
        const result = await client.query('SELECT COALESCE(MAX(account_no), 0) + 1 AS next_account_no FROM account');
        const newAccountNo = result.rows[0].next_account_no;

        // Insert new account
        await client.query('INSERT INTO account (account_no, name, balance, created_at) VALUES ($1, $2, $3, $4)', 
            [newAccountNo, name, balance, new Date().toISOString()]);

        await client.query('COMMIT');
        res.status(201).json({ account_no: newAccountNo });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).send(err.message);
    } finally {
        client.release();
    }
});

// Endpoint for listing accounts
app.get('/accounts', async (req, res) => {
    try {
        const result = await pool.query('SELECT account_no, name FROM account');
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Endpoint for getting account details
app.get('/account/:accountNo', async (req, res) => {
    const { accountNo } = req.params;
    
    try {
        const result = await pool.query('SELECT * FROM account WHERE account_no = $1', [accountNo]);
        
        if (result.rows.length === 0) {
            return res.status(404).send('Account not found');
        }
        
        res.status(200).json(result.rows[0]);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Endpoint for listing account numbers
app.get('/account-numbers', async (req, res) => {
    try {
        const result = await pool.query('SELECT account_no FROM account');
        res.status(200).json(result.rows.map(row => row.account_no));
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Endpoint for listing transactions
app.get('/transactions', async (req, res) => {
    try {
        const result = await pool.query('SELECT created_at, amount FROM transaction');
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Endpoint for getting transaction details
app.get('/transaction/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    
    try {  
        const result = await pool.query('SELECT * FROM transaction WHERE transaction_id = $1', [transactionId]);
        
        if (result.rows.length === 0) {
            return res.status(404).send('Transaction not found');
        }
        
        res.status(200).json(result.rows[0]);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Endpoint for transferring money
app.post('/transfer', async (req, res) => {
    const { creditAccountNo, debitAccountNo, amount } = req.body;
    const client = await pool.connect();
    const transactionId = uuidv4();  // Generate a UUID for the transaction

    try {
        await client.query('BEGIN');

        // Fetch account details with locking
        const creditAccount = await client.query('SELECT * FROM account WHERE account_no = $1 FOR UPDATE', [creditAccountNo]);
        const debitAccount = await client.query('SELECT * FROM account WHERE account_no = $1 FOR UPDATE', [debitAccountNo]);

        if (creditAccount.rows.length === 0 || debitAccount.rows.length === 0) {
            throw new Error('One or both accounts not found');
        }

        if (creditAccount.rows[0].balance < amount) {
            throw new Error('Insufficient funds');
        }

        // Update balances
        await client.query('UPDATE account SET balance = balance - $1 WHERE account_no = $2', [amount, creditAccountNo]);
        await client.query('UPDATE account SET balance = balance + $1 WHERE account_no = $2', [amount, debitAccountNo]);

        // Insert transaction with UUID
        await client.query('INSERT INTO transaction (transaction_id, amount, credit_account, debit_account, created_at) VALUES ($1, $2, $3, $4, $5)', 
            [transactionId, amount, creditAccountNo, debitAccountNo, new Date().toISOString()]);

        await client.query('COMMIT');
        res.status(200).send('Transfer successful');
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).send(err.message);
    } finally {
        client.release();
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
