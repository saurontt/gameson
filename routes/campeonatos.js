// routes/campeonatos.js

const express = require('express');
const db = require('../db');
const router = express.Router();

// --- ROTA 1: Listar campeonatos abertos (GET /api/campeonatos) ---
// Rota usada pela tela principal de campeonatos
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM campeonatos WHERE status = $1 ORDER BY data_criacao DESC',
      ['aberto']
    );
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Erro ao listar campeonatos:', error);
    res.status(500).json({ error: 'Erro ao buscar campeonatos.' });
  }
});

// --- ROTA 2: Criar um novo campeonato (POST /api/campeonatos) ---
router.post('/', async (req, res) => {
  // --- LINHA DE DEPURAÇÃO PARA VER O QUE O SERVIDOR RECEBE ---
  console.log(">>> CORPO DA REQUISIÇÃO RECEBIDO:", req.body);
  // -------------------------------------------------------------

  const { criador_id, nome, esporte, valor_inscricao, distribuicao_premios } = req.body;
  const taxa_plataforma = 0.10; // 10%

  if (!criador_id || !nome || !esporte || !valor_inscricao || !distribuicao_premios) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
  }

  try {
    const newCampeonato = await db.query(
      `INSERT INTO campeonatos (criador_id, nome, esporte, valor_inscricao, taxa_plataforma, distribuicao_premios, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'aberto') RETURNING *`,
      [criador_id, nome, esporte, valor_inscricao, taxa_plataforma, distribuicao_premios]
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

    // 1. Verifica se o campeonato existe e está aberto
    const campeonatoQuery = await db.query('SELECT * FROM campeonatos WHERE id = $1', [id]);
    if (campeonatoQuery.rows.length === 0 || campeonatoQuery.rows[0].status !== 'aberto') {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Campeonato não encontrado ou inscrições encerradas.' });
    }
    const valorInscricao = parseFloat(campeonatoQuery.rows[0].valor_inscricao);

    // 2. Verifica se os usuários têm saldo suficiente
    for (const usuarioId of [usuario1_id, usuario2_id]) {
      const userSaldoQuery = await db.query('SELECT saldo FROM usuarios WHERE id = $1', [usuarioId]);
      if (userSaldoQuery.rows.length === 0 || parseFloat(userSaldoQuery.rows[0].saldo) < valorInscricao) {
        await db.query('ROLLBACK');
        return res.status(402).json({ error: `Usuário ${usuarioId} não encontrado ou com saldo insuficiente.` });
      }
    }

    // 3. Debita o saldo de ambos e cria as transações
    for (const usuarioId of [usuario1_id, usuario2_id]) {
      await db.query('UPDATE usuarios SET saldo = saldo - $1 WHERE id = $2', [valorInscricao, usuarioId]);
      await db.query(
        'INSERT INTO transacoes (usuario_id, tipo, valor, descricao, campeonato_id) VALUES ($1, $2, $3, $4, $5)',
        [usuarioId, 'inscricao_campeonato', -valorInscricao, `Inscrição no campeonato ${campeonatoQuery.rows[0].nome}`, id]
      );
    }
    
    // 4. Inscreve a dupla
    await db.query(
      'INSERT INTO participantes_campeonato (campeonato_id, usuario1_id, usuario2_id) VALUES ($1, $2, $3)',
      [id, usuario1_id, usuario2_id]
    );
    
    // 5. Atualiza o pote do campeonato
    await db.query('UPDATE campeonatos SET pote_total = pote_total + $1 WHERE id = $2', [valorInscricao * 2, id]);

    await db.query('COMMIT');
    res.status(200).json({ message: 'Dupla inscrita com sucesso!' });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Erro ao inscrever dupla:', error);
    res.status(500).json({ error: 'Erro ao processar a inscrição.' });
  }
});

// --- ROTA 4: Iniciar o campeonato e gerar a chave (POST /api/campeonatos/:id/iniciar) ---
router.post('/:id/iniciar', async (req, res) => {
    const { id } = req.params;
    try {
        const participantes = await db.query('SELECT id, usuario1_id, usuario2_id FROM participantes_campeonato WHERE campeonato_id = $1', [id]);
        
        if (participantes.rows.length < 2) {
            return res.status(400).json({ error: 'Número insuficiente de duplas para iniciar.' });
        }

        // Lógica para embaralhar e criar os pares da primeira fase
        const duplasEmbaralhadas = participantes.rows.sort(() => Math.random() - 0.5);
        const faseNome = 'round_of_64'; // Ajustar conforme número de participantes
        const jogos = [];

        for (let i = 0; i < duplasEmbaralhadas.length; i += 2) {
            jogos.push({
                campeonato_id: id,
                fase: faseNome,
                participante1_id: duplasEmbaralhadas[i].id,
                participante2_id: duplasEmbaralhadas[i+1].id
            });
        }

        // Insere todos os jogos da primeira fase no banco de dados
        const insertQuery = 'INSERT INTO jogos_campeonato (campeonato_id, fase, participante1_id, participante2_id) VALUES ($1, $2, $3, $4)';
        await db.query('BEGIN');
        for (const jogo of jogos) {
            await db.query(insertQuery, [jogo.campeonato_id, jogo.fase, jogo.participante1_id, jogo.participante2_id]);
        }

        await db.query('UPDATE campeonatos SET status = $1 WHERE id = $2', ['em_andamento', id]);
        await db.query('COMMIT');

        res.status(200).json({ message: 'Campeonato iniciado e chave gerada!', fase: faseNome, jogos: jogos });

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Erro ao iniciar campeonato:', error);
        res.status(500).json({ error: 'Erro ao iniciar o campeonato.' });
    }
});


module.exports = router;