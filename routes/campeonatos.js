// routes/campeonatos.js - Lógica completa para o módulo de campeonatos
const express = require('express');
const db = require('../db');

const router = express.Router();

// --- FUNÇÕES AUXILIARES ---

// Função para debitar o valor da inscrição da carteira do usuário
async function debitarInscricao(usuarioId, valorInscricao, campeonatoId, descricao) {
  await db.query('BEGIN');
  await db.query('UPDATE usuarios SET saldo = saldo - $1 WHERE id = $2', [valorInscricao, usuarioId]);
  await db.query(
    'INSERT INTO transacoes (usuario_id, tipo, valor, descricao, campeonato_id) VALUES ($1, $2, $3, $4, $5)',
    ['inscricao_campeonato', -valorInscricao, `Inscrição no campeonato "${descricao}"`, campeonatoId]
  );
  await db.query('COMMIT');
}

// --- ROTAS DA API ---

// ROTA 1: Criar um novo campeonato
router.post('/', async (req, res) => {
  const { criador_id, nome, descricao, modalidade, valor_inscricao, regras } = req.body;

  if (!criador_id || !nome || !modalidade || !valor_inscricao) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
  }

  try {
    await db.query('BEGIN');

    // 1. Inserir o campeonato no banco
    const newCampeonato = await db.query(
      'INSERT INTO campeonatos (criador_id, nome, descricao, modalidade, valor_inscricao, status, regras) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [criador_id, nome, descricao, modalidade, valor_inscricao, 'aberto_para_inscricao', regras]
    );

    const campeonatoId = newCampeonato.rows[0].id;

    res.status(201).json(newCampeonato.rows[0]);

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Erro ao criar o campeonato:', error);
    res.status(500).json({ error: 'Erro ao criar o campeonato.' });
  }
});

// ROTA 2: Inscrever um usuário em um campeonato
router.post('/:id/inscrever', async (req, res) => {
  const { usuario_id } = req.body;
  const { id: campeonatoId } = req.params;

  if (!usuario_id) {
    return res.status(400).json({ error: 'ID do usuário é obrigatório.' });
  }

  try {
    // Verificar se o campeonato existe e está aberto para inscrições
    const campeonato = await db.query('SELECT status, valor_inscricao FROM campeonatos WHERE id = $1', [campeonatoId]);
    if (campeonato.rows.length === 0) {
      return res.status(404).json({ error: 'Campeonato não encontrado.' });
    }
    if (campeonato.rows[0].status !== 'aberto_para_inscricao') {
      return res.status(400).json({ error: 'Este campeonato não está mais aberto para inscrições.' });
    }

    const valorInscricao = campeonato.rows[0].valor_inscricao;

    // Inserir o participante e debitar o valor
    await db.query('BEGIN');
    await db.query(
      'INSERT INTO participantes_campeonato (campeonato_id, usuario_id, status) VALUES ($1, $2, $3)',
      [campeonatoId, usuario_id, 'inscrito']
    );
    await db.query('COMMIT');

    // Chamar a função auxiliar para debitar da carteira
    await debitarInscricao(usuario_id, valorInscricao, campeonatoId, `Inscrição no campeonato`);

    res.status(201).json({ message: 'Inscrição realizada com sucesso!' });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Erro ao se inscrever no campeonato:', error);
    res.status(500).json({ error: 'Erro ao se inscrever no campeonato.' });
  }
});

// ROTA 3: Reportar o resultado de uma partida (simplificado)
router.post('/:id/partida/:partidaId/reportar', async (req, res) => {
  const { id: campeonatoId, partidaId } = req.params;
  const { resultado, vencedor_id } = req.body;

  if (!resultado || !vencedor_id) {
    return res.status(400).json({ error: 'Resultado e vencedor são obrigatórios.' });
  }

  try {
    await db.query('BEGIN');

    // Atualizar o status da partida (simplificado)
    await db.query(
      'UPDATE partidas SET vencedor_id = $1 WHERE id = $2',
      [vencedor_id, partidaId]
    );

    // Lógica de prêmios pode ser adicionada aqui

    await db.query('COMMIT');

    res.status(200).json({ message: 'Resultado da partida reportado com sucesso!' });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Erro ao reportar partida:', error);
    res.status(500).json({ error: 'Erro ao reportar partida.' });
  }
});

// ROTA 4: Finalizar um campeonato
router.post('/:id/finalizar', async (req, res) => {
  const { id: campeonatoId } = req.params;
  const { colocacoes } = req.body; // Ex: {"1_lugar": {"vencedor_id": 1, "premio": "50%"}, "2_lugar": {"vencedor_id": 2, "premio": "30%"}}

  if (!id || !colocacoes) {
    return res.status(400).json({ error: 'ID do campeonato e as colocações são obrigatórios.' });
  }

  try {
    await db.query('BEGIN');

    // 1. Finalizar o campeonato
    await db.query('UPDATE campeonatos SET status = $1 WHERE id = $1', ['finalizado', campeonatoId]);

    // 2. Criar os prêmios no banco
    for (const [posicao, premio] of Object.entries(colocacoes)) {
      await db.query(
        'INSERT INTO premios_campeonato (campeonato_id, colocacao, descricao, valor) VALUES ($1, $2, $3, $4)',
        [campeonatoId, posicao, `Prêmio ${posicao}º Lugar`, premio.valor]
      );
    }

    await db.query('COMMIT');

    res.status(200).json({ message: 'Campeonato finalizado com sucesso!' });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Erro ao finalizar o campeonato:', error);
    res.status(500).json({ error: 'Erro ao finalizar o campeonato.' });
  }
});


module.exports = router;