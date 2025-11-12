// routes/disputas.js - Lógica das rotas de disputas
const express = require('express');
const db = require('../db');

const router = express.Router();

// ROTA para criar uma nova disputa
router.post('/', async (req, res) => {
  const { criador_id, titulo, valor_aposta } = req.body;

  if (!criador_id || !titulo || !valor_aposta) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
  }

  try {
    const newDisputa = await db.query(
      'INSERT INTO disputas (criador_id, titulo, valor_aposta) VALUES ($1, $2, $3) RETURNING *',
      [criador_id, titulo, valor_aposta]
    );

    await db.query(
      'INSERT INTO participantes_disputa (disputa_id, usuario_id, status_participante) VALUES ($1, $2, $3)',
      [newDisputa.rows[0].id, criador_id, 'aceito']
    );

    res.status(201).json(newDisputa.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar a disputa.' });
  }
});

module.exports = router;