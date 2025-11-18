// routes/feed.js - Lógica para o feed de disputas
const express = require('express');
const db = require('../db');

const router = express.Router();

// ROTA PARA LISTAR DISPUTAS ABERTAS (O FEED)
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT
        d.id,
        d.titulo,
        d.valor_aposta,
        d.data_hora_termino,
        u.nome AS criador_nome
      FROM
        disputas d
      JOIN
        usuarios u ON d.criador_id = u.id
      WHERE
        d.status = 'aguardando'
      ORDER BY
        d.data_hora_termino DESC;
    `;

    const result = await db.query(query);

    res.status(200).json(result.rows);

  } catch (error) {
    console.error('Erro ao buscar disputas no feed:', error);
    res.status(500).json({ error: 'Erro ao buscar disputas.' });
  }
});

module.exports = router;