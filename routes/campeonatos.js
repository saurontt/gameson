// routes/campeonatos.js

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
    console.error('Erro ao inscrever dupla:', error);
    res.status(500).json({ error: 'Erro ao processar a inscrição.' });
  }
});

// --- ROTA 4: Iniciar o campeonato e gerar a chave (POST /api/campeonatos/:id/iniciar) ---
router.post('/:id/iniciar', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('BEGIN');

        const participantesQuery = await db.query('SELECT id FROM participantes_campeonato WHERE campeonato_id = $1', [id]);
        const participantes = participantesQuery.rows;
        
        if (participantes.length < 4 || participantes.length % 2 !== 0) {
            await db.query('ROLLBACK');
            return res.status(400).json({ error: 'Número de participantes deve ser par e maior ou igual a 4 para iniciar.' });
        }

        let faseNome = 'final';
        if (participantes.length > 2) faseNome = 'semifinal';
        if (participantes.length > 4) faseNome = 'quartas';
        if (participantes.length > 8) faseNome = 'oitavas';

        const participantesEmbaralhados = participantes.sort(() => Math.random() - 0.5);
        const jogos = [];

        for (let i = 0; i < participantesEmbaralhados.length; i += 2) {
            jogos.push({
                campeonato_id: id,
                fase: faseNome,
                participante1_id: participantesEmbaralhados[i].id,
                participante2_id: participantesEmbaralhados[i+1].id
            });
        }

        const insertQuery = 'INSERT INTO jogos_campeonato (campeonato_id, fase, participante1_id, participante2_id) VALUES ($1, $2, $3, $4) RETURNING id';
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

// --- ROTA 5: Reportar resultado e avançar fase (LÓGICA FINAL) ---
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

        const campeonatoQuery = await db.query('SELECT configuracoes FROM campeonatos WHERE id = $1', [campeonatoIdInt]);
        const config = campeonatoQuery.rows[0].configuracoes;
        const premiacaoProgressiva = config.premiacao_progressiva;

        if (premiacaoProgressiva && premiacaoProgressiva.ativa && faseAtual !== 'disputa_terceiro_lugar') {
            const perdedorQuery = await db.query('SELECT usuario1_id, usuario2_id FROM participantes_campeonato WHERE id = $1', [perdedorId]);
            const perdedorDupla = perdedorQuery.rows[0];
            const premioEliminacao = parseFloat(premiacaoProgressiva.valor_eliminacao);
            const premioPorJogador = premioEliminacao / 2;

            await db.query('UPDATE usuarios SET saldo = saldo + $1 WHERE id = $2', [premioPorJogador, perdedorDupla.usuario1_id]);
            await db.query('UPDATE usuarios SET saldo = saldo + $1 WHERE id = $2', [premioPorJogador, perdedorDupla.usuario2_id]);
            
            await db.query('INSERT INTO transacoes (usuario_id, tipo, valor, descricao, campeonato_id) VALUES ($1, $2, $3, $4, $5)', [perdedorDupla.usuario1_id, 'premio_eliminacao', premioPorJogador, `Prêmio de eliminação no campeonato ${id}`, campeonatoIdInt]);
            await db.query('INSERT INTO transacoes (usuario_id, tipo, valor, descricao, campeonato_id) VALUES ($1, $2, $3, $4, $5)', [perdedorDupla.usuario2_id, 'premio_eliminacao', premioPorJogador, `Prêmio de eliminação no campeonato ${id}`, campeonatoIdInt]);

            await db.query('UPDATE campeonatos SET pote_total = pote_total - $1 WHERE id = $2', [premioEliminacao, campeonatoIdInt]);
        }

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
            } else if (proximaFase === 'disputa_terceiro_lugar') {
                 const jogosSemifinais = await db.query('SELECT * FROM jogos_campeonato WHERE campeonato_id = $1 AND fase = $2', [campeonatoIdInt, 'semifinal']);
                 const perdedoresSemifinal = jogosSemifinais.rows.map(jogo => {
                    if (jogo.vencedor_id === jogo.participante1_id) return jogo.participante2_id;
                    return jogo.participante1_id;
                });
                await criarProximaFase(campeonatoIdInt, proximaFase, perdedoresSemifinal);
                await criarProximaFase(campeonatoIdInt, 'final', vencedoresDaFase);
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
    
    // LÓGICA CORRIGIDA: Buscar a taxa de plataforma dinamicamente
    const taxaConfigQuery = await db.query('SELECT valor FROM configuracoes_sistema WHERE chave = $1', ['taxa_plataforma']);
    if (taxaConfigQuery.rows.length === 0) {
        throw new Error("Configuração 'taxa_plataforma' não encontrada no banco de dados.");
    }
    const taxaPlataformaDecimal = parseFloat(taxaConfigQuery.rows[0].valor);

    const distribuicaoPremios = campeonato.distribuicao_premios;
    const poteTotal = parseFloat(campeonato.pote_total);
    const taxa = poteTotal * taxaPlataformaDecimal;
    const potePremios = poteTotal - taxa;

    const vencedorFinalQuery = await db.query('SELECT usuario1_id, usuario2_id FROM participantes_campeonato WHERE id = $1', [vencedoresFinais[0]]);
    const viceFinalQuery = await db.query('SELECT usuario1_id, usuario2_id FROM participantes_campeonato WHERE id = $1', [vencedoresFinais[1]]);
    const terceiroLugarQuery = await db.query('SELECT usuario1_id, usuario2_id FROM participantes_campeonato WHERE id = $1', [vencedoresFinais[2]]);

    const vencedorFinal = vencedorFinalQuery.rows[0];
    const viceFinal = viceFinalQuery.rows[0];
    const terceiroLugar = terceiroLugarQuery.rows[0];

    const premioPrimeiro = potePremios * distribuicaoPremios['1'];
    const premioSegundo = potePremios * distribuicaoPremios['2'];
    const premioTerceiro = potePremios * distribuicaoPremios['3'];

    await pagarPremio(vencedorFinal.usuario1_id, vencedorFinal.usuario2_id, premioPrimeiro / 2, campeonatoId, 'ganho_campeonato_1_lugar');
    await pagarPremio(viceFinal.usuario1_id, viceFinal.usuario2_id, premioSegundo / 2, campeonatoId, 'ganho_campeonato_2_lugar');
    await pagarPremio(terceiroLugar.usuario1_id, terceiroLugar.usuario2_id, premioTerceiro / 2, campeonatoId, 'ganho_campeonato_3_lugar');

    // Registra a comissão da plataforma (transação)
    await db.query(
        'INSERT INTO transacoes (usuario_id, tipo, valor, descricao) VALUES ($1, $2, $3, $4)',
        [null, 'comissao_plataforma', taxa, `Comissão do campeonato ${campeonato.nome}`]
    );

    const resultadoFinalJson = JSON.stringify({
        "1": [vencedorFinal.usuario1_id, vencedorFinal.usuario2_id],
        "2": [viceFinal.usuario1_id, viceFinal.usuario2_id],
        "3": [terceiroLugar.usuario1_id, terceiroLugar.usuario2_id]
    });

    await db.query('UPDATE campeonatos SET status = $1, resultado_final = $2 WHERE id = $3', ['finalizado', resultadoFinalJson, campeonatoId]);
    console.log(`Campeonato ${campeonatoId} finalizado! Taxa de ${taxaPlataformaDecimal * 100}% aplicada.`);
}

async function pagarPremio(usuario1Id, usuario2Id, valorPorJogador, campeonatoId, tipoTransacao) {
    await db.query('UPDATE usuarios SET saldo = saldo + $1 WHERE id = $2', [valorPorJogador, usuario1Id]);
    await db.query('UPDATE usuarios SET saldo = saldo + $1 WHERE id = $2', [valorPorJogador, usuario2Id]);
    await db.query('INSERT INTO transacoes (usuario_id, tipo, valor, descricao, campeonato_id) VALUES ($1, $2, $3, $4, $5)', [usuario1Id, tipoTransacao, valorPorJogador, `Prêmio no campeonato ${campeonatoId}`, campeonatoId]);
    await db.query('INSERT INTO transacoes (usuario_id, tipo, valor, descricao, campeonato_id) VALUES ($1, $2, $3, $4, $5)', [usuario2Id, tipoTransacao, valorPorJogador, `Prêmio no campeonato ${campeonatoId}`, campeonatoId]);
}

module.exports = router;