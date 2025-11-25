const express = require('express');
const db = require('../db');
const router = express.Router();

// Mapeia o nome da fase para a próxima fase
const proximaFaseMap = {
    'oitavas': 'quartas',
    'quartas': 'semifinal',
    'semifinal': 'disputa_terceiro_lugar',
    'disputa_terceiro_lugar': 'final',
    'final': 'finalizado'
};

// --- ROTA 1: Listar campeonatos abertos (GET /api/campeonatos) ---
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM campeonatos WHERE status = $1 ORDER BY data_criacao DESC',
      ['aberto_para_inscricao']
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Erro ao listar campeonatos:', error);
    res.status(500).json({ error: 'Erro ao buscar campeonatos.' });
  }
});

// --- ROTA 2: Criar um novo campeonato (POST /api/campeonatos) ---
router.post('/', async (req, res) => {
  const { criador_id, nome, descricao, modalidade, esporte, valor_inscricao, formato, distribuicao_premios, configuracoes } = req.body;
  const taxa_plataforma = 0.10;

  if (!criador_id || !nome || !modalidade || !valor_inscricao || !formato || !distribuicao_premios) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando (criador_id, nome, modalidade, valor_inscricao, formato, distribuicao_premios).' });
  }

  try {
    const newCampeonato = await db.query(
      `INSERT INTO campeonatos (criador_id, nome, descricao, modalidade, esporte, valor_inscricao, taxa_plataforma, formato, distribuicao_premios, configuracoes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'aberto_para_inscricao') RETURNING *`,
      [criador_id, nome, descricao, modalidade, esporte, valor_inscricao, taxa_plataforma, formato, JSON.stringify(distribuicao_premios), JSON.stringify(configuracoes || {})]
    );

    res.status(201).json(newCampeonato.rows[0]);

  } catch (error) {
    console.error('Erro ao criar campeonato:', error);
    res.status(500).json({ error: 'Erro ao criar o campeonato.' });
  }
});

// --- ROTA 3: Inscrever uma dupla no campeonato (POST /api/campeonatos/:id/participar) ---
router.post('/:id/participar', async (req, res) => {
  const { id } = req.params;
  const { usuario1_id, usuario2_id } = req.body;

  if (!id || !usuario1_id || !usuario2_id) {
    return res.status(400).json({ error: 'ID do campeonato e IDs dos dois usuários são obrigatórios.' });
  }

  try {
    await db.query('BEGIN');

    const campeonatoQuery = await db.query('SELECT * FROM campeonatos WHERE id = $1', [id]);
    if (campeonatoQuery.rows.length === 0 || campeonatoQuery.rows[0].status !== 'aberto_para_inscricao') {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Campeonato não encontrado ou inscrições encerradas.' });
    }
    const valorInscricao = parseFloat(campeonatoQuery.rows[0].valor_inscricao);

    for (const usuarioId of [usuario1_id, usuario2_id]) {
      const participanteExistente = await db.query(
        'SELECT id FROM participantes_campeonato WHERE campeonato_id = $1 AND (usuario1_id = $2 OR usuario2_id = $2)',
        [id, usuarioId]
      );
      if (participanteExistente.rows.length > 0) {
        await db.query('ROLLBACK');
        return res.status(400).json({ error: `Usuário ${usuarioId} já está inscrito neste campeonato.` });
      }

      const userSaldoQuery = await db.query('SELECT saldo FROM usuarios WHERE id = $1', [usuarioId]);
      if (userSaldoQuery.rows.length === 0 || parseFloat(userSaldoQuery.rows[0].saldo) < valorInscricao) {
        await db.query('ROLLBACK');
        return res.status(402).json({ error: `Usuário ${usuarioId} não encontrado ou com saldo insuficiente.` });
      }

      await db.query('UPDATE usuarios SET saldo = saldo - $1 WHERE id = $2', [valorInscricao, usuarioId]);
      await db.query(
        'INSERT INTO transacoes (usuario_id, tipo, valor, descricao, campeonato_id) VALUES ($1, $2, $3, $4, $5)',
        [usuarioId, 'inscricao_campeonato', -valorInscricao, `Inscrição no campeonato ${campeonatoQuery.rows[0].nome}`, id]
      );
    }
    
    await db.query(
      'INSERT INTO participantes_campeonato (campeonato_id, usuario1_id, usuario2_id) VALUES ($1, $2, $3)',
      [id, usuario1_id, usuario2_id]
    );
    
    await db.query('UPDATE campeonatos SET pote_total = pote_total + $1 WHERE id = $2', [valorInscricao * 2, id]);

    await db.query('COMMIT');
    res.status(200).json({ message: 'Dupla inscrita com sucesso!' });

  } catch (error) {
    await db.query('ROLLBACK');
    // >>> LINHA DE DIAGNÓSTICO <<<
    console.error('Erro ao inscrever dupla (detalhado):', error);
    res.status(500).json({ error: 'Erro ao processar a inscrição.' });
  }
});

// ... (o resto do arquivo permanece o mesmo)
// Para manter a resposta curta, estou omitindo o resto do arquivo, mas você deve manter o código que já existe para as outras rotas.
// Se preferir, posso fornecer o arquivo completo novamente.
module.exports = router;
