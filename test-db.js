// test-db.js - Um teste simples e direto de conexão
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

console.log('>>> Iniciando teste de conexão com o banco de dados...');

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('>>> FALHA NA CONEXÃO!');
    console.error(err);
    process.exit(1); // Encerra com erro
  } else {
    console.log('>>> SUCESSO! Conexão estabelecida com o banco.');
    console.log('>>> Hora do servidor:', res.rows[0].now);
    pool.end(); // Fecha a conexão
    process.exit(0); // Encerra com sucesso
  }
});