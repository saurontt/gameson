// db.js - Conexão com tentativas de repetição para "acordar" o banco
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  // Aumenta um pouco o tempo de espera
  connectionTimeoutMillis: 10000, // 10 segundos
  idleTimeoutMillis: 30000,     // 30 segundos
});

// A função "insistente"
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
        throw err; // Se as tentativas acabarem, retorna o erro
      }
      // Espera um pouco antes de tentar de novo (2 segundos)
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

module.exports = {
  query,
};