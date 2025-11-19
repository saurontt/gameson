// routes/campeonatos.js - Lógica completa para o módulo de campeonatos
const express = require('express');
const db = require('../db');

const router = express.Router();

// --- FUNÇÕES AUXILIARES ---

// Função para debitar o valor da inscrição da carteira do usuário
async function debitarInscricao(usuarioId, valorInscricao, campeonatoId, descricao) {
  await db.query('BEGIN');

  // 1. Debitar o valor da inscrição do usuário
  await db.query('UPDATE usuarios SET saldo = saldo - $1 WHERE id = $2', [valorInscricao, usuarioId]);

  // 2. Registrar a transação
  await db.query(
    'INSERT INTO transacoes (usuario_id, tipo, valor, descricao, campeonato_id) VALUES ($1, $2, $3, $4, $5)',
    ['inscricao_campeonato', -valorInscricao, `Inscrição no campeonato "${descricao}"`, campeonatoId]
  );

  await db.query('COMMIT');
}

// Função para creditar um prêmio
async function creditarPremio(usuarioId, valorPremio, descricao, campeonatoId) {
  await db.query('BEGIN');

  await db.query('UPDATE usuarios SET saldo = saldo + $1 WHERE id = $2', [valorPremio, usuarioId]);
  await db.query(
    'INSERT INTO transacoes (usuario_id, tipo, valor, descricao, campeonato_id) VALUES ($1, $2, $3, $4, $5)',
    ['ganho_campeonato', valorPremio, `Prêmio no campeonato "${descricao}"`, campeonatoId]
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
    // Inserir o campeonato no banco
    const newCampeonato = await db.query(
      'INSERT INTO campeonatos (criador_id, nome, descricao, modalidade, valor_inscricao, regras) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [criador_id, nome, descricao, modalidade, valor_inscricao, regras]
    );

    res.status(201).json(newCampeonato.rows[0]);

  } catch (error) {
    console.error('Erro ao criar campeonato:', error);
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
      return res.status(400).json({ error: 'As inscrições para este campeonato estão fechadas.' });
    }

    const valorInscricao = campeonato.rows[0].valor_inscricao;

    // Inserir o participante e debitar a taxa
    await db.query('BEGIN');
    await db.query(
      'INSERT INTO participantes_campeonato (campeonato_id, usuario_id, status_participante) VALUES ($1, $2, $3)',
      [campeonatoId, usuario_id, 'inscrito']
    );
    await db.query(
      'INSERT INTO transacoes (usuario_id, tipo, valor, descricao, campeonato_id) VALUES ($1, $2, $3, $4, $5)',
      [usuario_id, 'inscricao_campeonato', -valorInscricao, `Inscrição no campeonato "${campeonato.rows[0].nome}"`, campeonatoId]
    );
    await db.query('COMMIT');

    res.status(201).json({ message: 'Inscrição realizada com sucesso!' });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Erro ao se inscrever:', error);
    res.status(500). { error: 'Erro ao se inscrever no campeonato.' };
  }
});

// ROTA 3: Reportar o resultado de uma partida (simplificado)
router.post('/:id/partida/:partidaId/reportar', async (req, res) => {
  const { resultado, vencedor_id } = req.body;
  const { id: campeonatoId, partidaId } = req.params;

  if (!resultado || !vencedor_id) {
    return res.status(400).json({ error: 'Resultado e vencedor são obrigatórios.' });
  }

  try {
    // Atualizar o resultado da partida
    await db.query(
      'UPDATE partidas SET vencedor_id = $1 WHERE id = $2',
      [vencedor_id, partidaId]
    );

    res.status(200).json({ message: 'Resultado da partida reportado com sucesso!' });

  } catch (error) {
    console.error('Erro ao reportar partida:', error);
    res.status(500).json({ error: 'Erro ao reportar partida.' });
  }
});

// ROTA 4: Finalizar um campeonato (simplificado - focado no Futevôlei)
router.post('/:id/finalizar', async (req, res) => {
  const { colocacoes } = req.body; // Ex: { "1": {"descricao": "1º Lugar", "valor": "1000.00"}, "2": {"descricao": "2º Lugar", "valor": "500.00"}, "3": {"descricao": "3º Lugar", "valor": "250.00"} }
  const { id: campeonatoId } = req.params;

  if (!colocacoes || !Array.isArray(colocacoes)) {
    return res.status(400).json({ error: 'A lista de colocações é obrigatória.' });
  }

  try {
    await db.query('BEGIN');

    // Atualizar o status do campeonato para 'finalizado'
    await db.query('UPDATE campeonatos SET status = $1 WHERE id = $2', ['finalizado', campeonatoId]);

    // Inserir os prêmios fixos no banco
    for (const colocacao of colocacoes) {
      await db.query(
        'INSERT INTO premios_campeonato (campeonato_id, colocacao, descricao, valor, tipo) VALUES ($1, $2, $3, $4, $5)',
        [campeonatoId, colocacao.colocacao, colocacao.descricao, colocacao.valor, 'fixo']
      );
    }

    // Lógica do prêmio progressivo (ex: Futevôlei)
    // Aqui você pode adicionar a lógica para calcular o valor total do pote de cada eliminação
    // e distribuir. Por ora, vamos focar nos prêmios fixos.

    await db.query('COMMIT');

    res.status(200).json({ message: 'Campeonato finalizado com sucesso!' });

  } catch (error) {
    await db.query('LISTA ROLLBACK');
    console.error('Erro ao finalizar campeonato:', error);
    res.status(500).json({ error: 'Erro ao finalizar campeonato.' });
  }
});


module.exports = router;