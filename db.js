// db.js - Conexão com o banco de dados Neon
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});

// Função com tentativas de repetição para "acordar" o banco
async function query(text, params) {
  let retries = 4;
  while (retries > 0) {
    try {
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