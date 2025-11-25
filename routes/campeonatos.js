cat > routes/campeonatos.js << 'EOF'
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

// --- ROTA 3: Inscrever um USUÁRIO no campeonato (POST /api/campeonatos/:id/participar) ---
router.post('/:id/participar', async (req, res) => {
  const { id } = req.params;
  const { usuario_id } = req.body;

  if (!id || !usuario_id) {
    return res.status(400).json({ error: 'ID do campeonato e ID do usuário são obrigatórios.' });
  }

  try {
    await db.query('BEGIN');

    const campeonatoQuery = await db.query('SELECT * FROM campeonatos WHERE id = $1', [id]);
    if (campeonatoQuery.rows.length === 0 || campeonatoQuery.rows[0].status !== 'aberto_para_inscricao') {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Campeonato não encontrado ou inscrições encerradas.' });
    }
    const valorInscricao = parseFloat(campeonatoQuery.rows[0].valor_inscricao);

    const participanteExistente = await db.query(
      'SELECT id FROM participantes_campeonato WHERE campeonato_id = $1 AND usuario_id = $2',
      [id, usuario_id]
    );
    if (participanteExistente.rows.length > 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: `Usuário ${usuario_id} já está inscrito neste campeonato.` });
    }

    const userSaldoQuery = await db.query('SELECT saldo FROM usuarios WHERE id = $1', [usuario_id]);
    if (userSaldoQuery.rows.length === 0 || parseFloat(userSaldoQuery.rows[0].saldo) < valorInscricao) {
      await db.query('ROLLBACK');
      return res.status(402).json({ error: `Usuário ${usuario_id} não encontrado ou com saldo insuficiente.` });
    }

    await db.query('UPDATE usuarios SET saldo = saldo - $1 WHERE id = $2', [valorInscricao, usuario_id]);
    await db.query(
      'INSERT INTO transacoes (usuario_id, tipo, valor, descricao, campeonato_id) VALUES ($1, $2, $3, $4, $5)',
      [usuario_id, 'inscricao_campeonato', -valorInscricao, `Inscrição no campeonato ${campeonatoQuery.rows[0].nome}`, id]
    );
    
    await db.query(
      'INSERT INTO participantes_campeonato (campeonato_id, usuario_id) VALUES ($1, $2)',
      [id, usuario_id]
    );
    
    await db.query('UPDATE campeonatos SET pote_total = pote_total + $1 WHERE id = $2', [valorInscricao, id]);

    await db.query('COMMIT');
    res.status(200).json({ message: 'Usuário inscrito com sucesso!' });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Erro ao inscrever usuário:', error);
    res.status(500).json({ error: 'Erro ao processar a inscrição.' });
  }
});

// --- ROTA 4: Iniciar o campeonato e gerar a chave (POST /api/campeonatos/:id/iniciar) ---
router.post('/:id/iniciar', async (req, res) => {
    const { id } = req.params;
    const campeonatoIdInt = parseInt(id, 10); // CORREÇÃO: Converte o ID para inteiro

    try {
        await db.query('BEGIN');

        const participantesQuery = await db.query('SELECT id FROM participantes_campeonato WHERE campeonato_id = $1 ORDER BY id', [campeonatoIdInt]);
        const participantes = participantesQuery.rows;
        
        if (participantes.length < 4 || participantes.length % 2 !== 0) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Número de participantes deve ser par e maior ou igual a 4 para iniciar.' });
        }

        let faseNome = 'final';
        if (participantes.length > 2) faseNome = 'semifinal';
        if (participantes.length > 4) faseNome = 'quartas';
        if (participantes.length > 8) faseNome = 'oitavas';

        const jogos = [];
        for (let i = 0; i < participantes.length; i += 2) {
            jogos.push({
                campeonato_id: campeonatoIdInt, // CORREÇÃO: Usa o ID como inteiro
                fase: faseNome,
                participante1_id: participantes[i].id,
                participante2_id: participantes[i+1].id
            });
        }

        const insertQuery = 'INSERT INTO jogos_campeonato (campeonato_id, fase, participante1_id, participante2_id) VALUES ($1, $2, $3, $4) RETURNING id';
        for (const jogo of jogos) {
            await db.query(insertQuery, [jogo.campeonato_id, jogo.fase, jogo.participante1_id, jogo.participante2_id]);
        }

        await db.query('UPDATE campeonatos SET status = $1 WHERE id = $2', ['em_andamento', campeonatoIdInt]); // CORREÇÃO: Usa o ID como inteiro
        await db.query('COMMIT');

        res.status(200).json({ message: 'Campeonato iniciado e chave gerada!', fase: faseNome, jogos: jogos });

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Erro ao iniciar campeonato:', error);
        res.status(500).json({ error: 'Erro ao iniciar o campeonato.' });
    }
});

// O resto do arquivo continua igual...
module.exports = router;
EOF