// db.js - Conexão com o certificado de segurança oficial
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
    ca: fs.readFileSync(path.join(__dirname, 'prod-ca-2021.crt')).toString()
  },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});

async function query(text, params) {
  let retries = 4;
  while (retries > 0) {
    try {
      const start = Date.now();
      const res = await pool.query(text, params);
      return res;
    } catch (err) {
      retries -= 1;
      console.log(`Falha na conexão. Tentativas restantes: ${retries}. Erro: ${err.code}`);
      if (retries === 0) {
        console.error('Erro no banco após 4 tentativas:', err);
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

module.exports = {
  query,
};