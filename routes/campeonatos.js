// routes/campeonatos.js

const express = require('express');
const db = require('../db');
const router = express.Router();

// Mapeia o nome da fase para a próxima fase (SIMPLIFICADO)
const proximaFaseMap = {
    'quartas': 'semifinal',
    'semifinal': 'final',
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
    const campeonatoIdInt = parseInt(id, 10);

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
                campeonato_id: campeonatoIdInt,
                fase: faseNome,
                participante1_id: participants[i].id,
                participante2_id: participants[i+1].id
            });
        }

        const insertQuery = 'INSERT INTO jogos_campeonato (campeonato_id, fase, participante1_id, participante2_id) VALUES ($1, $2, $3, $4) RETURNING id';
        const jogosCriados = [];
        for (const jogo of jogos) {
            const result = await db.query(insertQuery, [jogo.campeonato_id, jogo.fase, jogo.participante1_id, jogo.participante2_id]);
            jogosCriados.push({ ...jogo, id: result.rows[0].id });
        }

        await db.query('UPDATE campeonatos SET status = $1 WHERE id = $2', ['em_andamento', campeonatoIdInt]);
        await db.query('COMMIT');

        res.status(200).json({ message: 'Campeonato iniciado e chave gerada!', fase: faseNome, jogos: jogosCriados });

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Erro ao iniciar campeonato:', error);
        res.status(500).json({ error: 'Erro ao iniciar o campeonato.' });
    }
});

// --- ROTA 5: Listar jogos de um campeonato (NOVA) ---
router.get('/:id/jogos', async (req, res) => {
    const { id } = req.params;
    const campeonatoIdInt = parseInt(id, 10);

    try {
        const jogosQuery = await db.query(
            'SELECT * FROM jogos_campeonato WHERE campeonato_id = $1 ORDER BY id',
            [campeonatoIdInt]
        );
        res.status(200).json(jogosQuery.rows);

    } catch (error) {
        console.error('Erro ao listar jogos:', error);
        res.status(500).json({ error: 'Erro ao listar os jogos.' });
    }
});


// --- ROTA 6: Reportar resultado e avançar fase (LÓGICA FINAL) ---
router.post('/:id/jogos/:jogoId/reportar', async (req, res) => {
    const { id, jogoId } = req.params;
    const { resultado_participante1, resultado_participante2 } = req.body;

    if (!resultado_participante1 || !resultado_participante2) {
        return res.status(400).json({ error: 'Os resultados dos dois participantes são obrigatórios.' });
    }

    try {
        await db.query('BEGIN');

        const campeonatoIdInt = parseInt(id, 10);
        const jogoIdInt = parseInt(jogoId, 10);

        const jogoQuery = await db.query('SELECT * FROM jogos_campeonato WHERE id = $1 AND campeonato_id = $2', [jogoIdInt, campeonatoIdInt]);
        if (jogoQuery.rows.length === 0) {
            await db.query('ROLLBACK');
            return res.status(404).json({ error: 'Jogo não encontrado.' });
        }
        const jogo = jogoQuery.rows[0];
        const faseAtual = jogo.fase;

        const resultado1 = parseInt(resultado_participante1);
        const resultado2 = parseInt(resultado_participante2);
        let vencedorId, perdedorId;
        if (resultado1 > resultado2) {
            vencedorId = jogo.participante1_id;
            perdedorId = jogo.participante2_id;
        } else if (resultado2 > resultado1) {
            vencedorId = jogo.participante2_id;
            perdedorId = jogo.participante1_id;
        } else {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Empates não são permitidos nesta fase.' });
        }

        await db.query(
            'UPDATE jogos_campeonato SET resultado_participante1 = $1, resultado_participante2 = $2, vencedor_id = $3 WHERE id = $4',
            [resultado1, resultado2, vencedorId, jogoIdInt]
        );

        // Lógica de prêmio por eliminação (se houver)
        const campeonatoQuery = await db.query('SELECT configuracoes FROM campeonatos WHERE id = $1', [campeonatoIdInt]);
        const config = campeonatoQuery.rows[0].configuracoes;
        const premiacaoProgressiva = config.premiacao_progressiva;

        if (premiacaoProgressiva && premiacaoProgressiva.ativa && faseAtual !== 'final') {
            const perdedorQuery = await db.query('SELECT usuario_id FROM participantes_campeonato WHERE id = $1', [perdedorId]);
            const perdedorUsuarioId = perdedorQuery.rows[0].usuario_id;
            const premioEliminacao = parseFloat(premiacaoProgressiva.valor_eliminacao);

            await db.query('UPDATE usuarios SET saldo = saldo + $1 WHERE id = $2', [premioEliminacao, perdedorUsuarioId]);
            await db.query('INSERT INTO transacoes (usuario_id, tipo, valor, descricao, campeonato_id) VALUES ($1, $2, $3, $4, $5)', [perdedorUsuarioId, 'premio_eliminacao', premioEliminacao, `Prêmio de eliminação no campeonato ${id}`, campeonatoIdInt]);
            await db.query('UPDATE campeonatos SET pote_total = pote_total - $1 WHERE id = $2', [premioEliminacao, campeonatoIdInt]);
        }

        // Lógica para avançar de fase
        const jogosDaFaseQuery = await db.query(
            'SELECT id, vencedor_id FROM jogos_campeonato WHERE campeonato_id = $1 AND fase = $2',
            [campeonatoIdInt, faseAtual]
        );
        
        const todosJogosConcluidos = jogosDaFaseQuery.rows.every(j => j.vencedor_id !== null);

        if (todosJogosConcluidos) {
            const vencedoresDaFase = jogosDaFaseQuery.rows.map(j => j.vencedor_id);
            const proximaFase = proximaFaseMap[faseAtual];

            if (proximaFase === 'finalizado') {
                await finalizarCampeonato(campeonatoIdInt, vencedoresDaFase);
            } else {
                await criarProximaFase(campeonatoIdInt, proximaFase, vencedoresDaFase);
            }
        }

        await db.query('COMMIT');
        res.status(200).json({ message: 'Resultado reportado com sucesso!', vencedor_id: vencedorId });

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Erro ao reportar resultado:', error);
        res.status(500).json({ error: 'Erro ao reportar resultado.' });
    }
});

// --- FUNÇÕES DE APOIO ---

async function criarProximaFase(campeonatoId, nomeFase, vencedoresIds) {
    if (vencedoresIds.length < 2) return;
    const jogos = [];
    for (let i = 0; i < vencedoresIds.length; i += 2) {
        jogos.push({
            campeonato_id: campeonatoId,
            fase: nomeFase,
            participante1_id: vencedoresIds[i],
            participante2_id: vencedoresIds[i+1]
        });
    }
    const insertQuery = 'INSERT INTO jogos_campeonato (campeonato_id, fase, participante1_id, participante2_id) VALUES ($1, $2, $3, $4)';
    for (const jogo of jogos) {
        await db.query(insertQuery, [jogo.campeonato_id, jogo.fase, jogo.participante1_id, jogo.participante2_id]);
    }
    console.log(`Criados ${jogos.length} jogos para a fase ${nomeFase} do campeonato ${campeonatoId}`);
}

async function finalizarCampeonato(campeonatoId, vencedoresFinais) {
    const campeonatoQuery = await db.query('SELECT * FROM campeonatos WHERE id = $1', [campeonatoId]);
    const campeonato = campeonatoQuery.rows[0];
    
    const taxaConfigQuery = await db.query('SELECT valor FROM configuracoes_sistema WHERE chave = $1', ['taxa_plataforma']);
    if (taxaConfigQuery.rows.length === 0) {
        throw new Error("Configuração 'taxa_plataforma' não encontrada no banco de dados.");
    }
    const taxaPlataformaDecimal = parseFloat(taxaConfigQuery.rows[0].valor);

    const distribuicaoPremios = campeonato.distribuicao_premios;
    const poteTotal = parseFloat(campeonato.pote_total);
    const taxa = poteTotal * taxaPlataformaDecimal;
    const potePremios = poteTotal - taxa;

    const vencedorFinalQuery = await db.query('SELECT usuario_id FROM participantes_campeonato WHERE id = $1', [vencedoresFinais[0]]);
    const viceFinalQuery = await db.query('SELECT usuario_id FROM participantes_campeonato WHERE id = $1', [vencedoresFinais[1]]);

    const vencedorFinal = vencedorFinalQuery.rows[0];
    const viceFinal = viceFinalQuery.rows[0];

    const premioPrimeiro = potePremios * distribuicaoPremios['1'];
    const premioSegundo = potePremios * distribuicaoPremios['2'];

    await db.query('UPDATE usuarios SET saldo = saldo + $1 WHERE id = $2', [premioPrimeiro, vencedorFinal.usuario_id]);
    await db.query('UPDATE usuarios SET saldo = saldo + $1 WHERE id = $2', [premioSegundo, viceFinal.usuario_id]);

    await db.query('INSERT INTO transacoes (usuario_id, tipo, valor, descricao, campeonato_id) VALUES ($1, $2, $3, $4, $5)', [vencedorFinal.usuario_id, 'ganho_campeonato_1_lugar', premioPrimeiro, `Prêmio no campeonato ${campeonatoId}`, campeonatoId]);
    await db.query('INSERT INTO transacoes (usuario_id, tipo, valor, descricao, campeonato_id) VALUES ($1, $2, $3, $4, $5)', [viceFinal.usuario_id, 'ganho_campeonato_2_lugar', premioSegundo, `Prêmio no campeonato ${campeonatoId}`, campeonatoId]);
    
    await db.query(
        'INSERT INTO transacoes (usuario_id, tipo, valor, descricao) VALUES ($1, $2, $3, $4)',
        [null, 'comissao_plataforma', taxa, `Comissão do campeonato ${campeonato.nome}`]
    );

    const resultadoFinalJson = JSON.stringify({
        "1": [vencedorFinal.usuario_id],
        "2": [viceFinal.usuario_id]
    });

    await db.query('UPDATE campeonatos SET status = $1, resultado_final = $2 WHERE id = $3', ['finalizado', resultadoFinalJson, campeonatoId]);
    console.log(`Campeonato ${campeonatoId} finalizado! Taxa de ${taxaPlataformaDecimal * 100}% aplicada.`);
}
// --- NOVA ROTA: Listar campeonatos com detalhes para o front-end (GET /api/campeonatos/listar-detalhados) ---
router.get('/listar-detalhados', async (req, res) => {
    try {
        // Query principal para buscar os campeonatos e informações do criador
        const queryCampeonatos = `
            SELECT 
                c.id,
                c.nome,
                c.descricao,
                c.modalidade,
                c.esporte,
                c.valor_inscricao,
                c.pote_total,
                c.data_criacao,
                c.status,
                u.nome AS nome_criador
            FROM campeonatos c
            LEFT JOIN usuarios u ON c.criador_id = u.id
            ORDER BY c.data_criacao DESC
        `;
        const campeonatosResult = await db.query(queryCampeonatos);
        const campeonatos = campeonatosResult.rows;

        // Para cada campeonato, buscamos o número de participantes
        for (const campeonato of campeonatos) {
            const queryParticipantes = `
                SELECT COUNT(*) as total_participantes
                FROM participantes_campeonato
                WHERE campeonato_id = $1
            `;
            const participantesResult = await db.query(queryParticipantes, [campeonato.id]);
            campeonato.total_participantes = parseInt(participantesResult.rows[0].total_participantes);
        }

        res.status(200).json(campeonatos);

    } catch (error) {
        console.error("Erro ao buscar campeonatos detalhados:", error);
        res.status(500).json({ error: "Erro interno no servidor ao buscar campeonatos." });
    }
});
module.exports = router;