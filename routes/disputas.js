// routes/disputas.js - Lógica completa para Disputas Pessoais
const express = require('express');
const db = require('../db');

const router = express.Router();

// --- FUNÇÕES AUXILIARES ---

// Busca o nome de um usuário pelo ID
async function getUserNameById(usuarioId) {
  if (!usuarioId) return null;
  const result = await db.query('SELECT nome FROM usuarios WHERE id = $1', [usuarioId]);
  return result.rows[0] ? result.rows[0].nome : 'Usuário Desconhecido';
}

// --- ROTAS DA API ---

// ROTA 1: Criar uma nova disputa (POST /api/disputas)
router.post('/', async (req, res) => {
  const { criador_id, titulo, valor_aposta, tipo = 'individual' } = req.body;

  if (!criador_id || !titulo || !valor_aposta) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
  }

  try {
    // Inicia uma transação para garantir a consistência dos dados
    await db.query('BEGIN');

    // 1. Insere a nova disputa
    const newDisputa = await db.query(
      'INSERT INTO disputas (criador_id, titulo, valor_aposta, tipo) VALUES ($1, $2, $3, $4) RETURNING *',
      [criador_id, titulo, valor_aposta, tipo]
    );

    const disputaId = newDisputa.rows[0].id;

    // 2. Adiciona o criador como o primeiro participante com status 'aceito'
    await db.query(
      'INSERT INTO participantes_disputa (disputa_id, usuario_id, status_participante) VALUES ($1, $2, $3)',
      [disputaId, criador_id, 'aceito']
    );

    // 3. Cria a transação da aposta (para controle financeiro)
    await db.query(
      'INSERT INTO transacoes (usuario_id, tipo, valor, descricao, disputa_id) VALUES ($1, $2, $3, $4, $5)',
      [criador_id, 'aposta', -valor_aposta, `Aposta na disputa "${titulo}"`, disputaId]
    );

    // Se tudo deu certo, confirma a transação
    await db.query('COMMIT');

    res.status(201).json(newDisputa.rows[0]);

  } catch (error) {
    // Se algo deu errado, desfaz todas as operações
    await db.query('ROLLBACK');
    console.error('Erro ao criar disputa:', error);
    res.status(500).json({ error: 'Erro ao criar a disputa.' });
  }
});

// ROTA 2: Listar disputas abertas para o feed (GET /api/disputas)
// Esta rota substitui a que criamos no feed.js, pois está mais completa
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT
        d.id,
        d.titulo,
        d.valor_aposta,
        d.data_hora_termino,
        d.tipo,
        u.nome AS criador_nome,
        COUNT(pd.usuario_id) - 1 as num_participantes
      FROM
        disputas d
      JOIN
        usuarios u ON d.criador_id = u.id
      LEFT JOIN
        participantes_disputa pd ON d.id = pd.disputa_id AND pd.status_participante = 'aceito'
      WHERE
        d.status = 'aguardando'
      GROUP BY
        d.id, d.titulo, d.valor_aposta, d.data_hora_termino, d.tipo, u.nome
      ORDER BY
        d.data_criacao DESC
    `;

    const result = await db.query(query);
    res.status(200).json(result.rows);

  } catch (error) {
    console.error('Erro ao buscar disputas no feed:', error);
    res.status(500).json({ error: 'Erro ao buscar disputas.' });
  }
});

// ROTA 3: Convidar usuários para uma disputa (POST /api/disputas/:id/convidar)
router.post('/:id/convidar', async (req, res) => {
  const { id } = req.params;
  const { usuarios_ids } = req.body; // Espera um array de IDs, ex: [2, 3]

  if (!id || !usuarios_ids || !Array.isArray(usuarios_ids)) {
    return res.status(400).json({ error: 'ID da disputa e lista de usuários são obrigatórios.' });
  }

  try {
    const disputa = await db.query('SELECT criador_id FROM disputas WHERE id = $1', [id]);
    if (disputa.rows.length === 0) {
      return res.status(404).json({ error: 'Disputa não encontrada.' });
    }

    // Aqui você pode adicionar lógica para verificar se o usuário logado é o criador da disputa
    // Por enquanto, vamos permitir que qualquer um convide (para testes)

    const values = usuarios_ids.map(usuarioId => `(${id}, ${usuarioId}, 'convidado')`).join(',');
    const insertQuery = `INSERT INTO participantes_disputa (disputa_id, usuario_id, status_participante) VALUES ${values}`;

    await db.query(insertQuery);
    res.status(201).json({ message: 'Convites enviados com sucesso!' });

  } catch (error) {
    console.error('Erro ao enviar convites:', error);
    res.status(500).json({ error: 'Erro ao enviar convites.' });
  }
});


// ROTA 4: Aceitar um convite para uma disputa (POST /api/disputas/:id/aceitar)
router.post('/:id/aceitar', async (req, res) => {
  const { id } = req.params;
  const { usuario_id } = req.body;

  if (!id || !usuario_id) {
    return res.status(400).json({ error: 'ID da disputa e ID do usuário são obrigatórios.' });
  }

  try {
    const participante = await db.query(
      'SELECT * FROM participantes_disputa WHERE disputa_id = $1 AND usuario_id = $2',
      [id, usuario_id]
    );

    if (participante.rows.length === 0) {
      return res.status(404).json({ error: 'Convite não encontrado.' });
    }

    if (participante.rows[0].status_participante !== 'convidado') {
      return res.status(400).json({ error: 'Este convite já foi respondido.' });
    }

    // Pega o valor da aposta para criar a transação
    const disputa = await db.query('SELECT valor_aposta FROM disputas WHERE id = $1', [id]);
    const valorAposta = disputa.rows[0].valor_aposta;

    await db.query('BEGIN');

    // Atualiza o status do participante para 'aceito'
    await db.query(
      'UPDATE participantes_disputa SET status_participante = $1 WHERE disputa_id = $2 AND usuario_id = $3',
      ['aceito', id, usuario_id]
    );

    // Cria a transação da aposta
    await db.query(
      'INSERT INTO transacoes (usuario_id, tipo, valor, descricao, disputa_id) VALUES ($1, $2, $3, $4, $5)',
      [usuario_id, 'aposta', -valorAposta, `Aposta na disputa ID ${id}`, id]
    );

    await db.query('COMMIT');

    res.status(200).json({ message: 'Disputa aceita com sucesso!' });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Erro ao aceitar disputa:', error);
    res.status(500).json({ error: 'Erro ao aceitar disputa.' });
  }
});


// ROTA 5: Finalizar uma disputa por consenso (POST /api/disputas/:id/finalizar)
router.post('/:id/finalizar', async (req, res) => {
  const { id } = req.params;
  const { vencedor_usuario_id } = req.body;

  if (!id || !vencedor_usuario_id) {
    return res.status(400).json({ error: 'ID da disputa e ID do vencedor são obrigatórios.' });
  }

  try {
    // CORREÇÃO: Busca os valores individuais das apostas
    const disputaQuery = await db.query('SELECT valor_aposta_criador, valor_aposta_desafiado FROM disputas WHERE id = $1', [id]);
    if (disputaQuery.rows.length === 0) return res.status(404).json({ error: 'Disputa não encontrada.' });

    const { valor_aposta_criador, valor_aposta_desafiado } = disputaQuery.rows[0];

    // LÓGICA CORRIGIDA: Soma os valores das apostas
    const valorTotal = parseFloat(valor_aposta_criador) + parseFloat(valor_aposta_desafiado);

    const taxa = await db.query('SELECT valor FROM configuracoes_plataforma WHERE chave = $1', ['taxa_disputa_pessoal']);
    const valorTaxa = valorTotal * (parseFloat(taxa.rows[0].valor) / 100);
    const valorPremio = valorTotal - valorTaxa;

    await db.query('BEGIN');

    // 1. Registra o resultado da disputa
    await db.query(
      'INSERT INTO resultados_disputa (disputa_id, vencedor_usuario_id, status_final) VALUES ($1, $2, $3)',
      [id, vencedor_usuario_id, 'consenso']
    );

    // 2. Atualiza o status da disputa
    await db.query('UPDATE disputas SET status = $1 WHERE id = $2', ['finalizada', id]);

    // 3. Transfere o valor para o vencedor
    await db.query(
      'UPDATE usuarios SET saldo = saldo + $1 WHERE id = $2',
      [valorPremio, vencedor_usuario_id]
    );

    // 4. Registra a transação de ganho do vencedor
    await db.query(
      'INSERT INTO transacoes (usuario_id, tipo, valor, descricao, disputa_id) VALUES ($1, $2, $3, $4, $5)',
      [vencedor_usuario_id, 'ganho', valorPremio, `Ganho na disputa ID ${id}`, id]
    );

    // 5. Registra a transação da comissão da plataforma
    await db.query(
      'INSERT INTO transacoes (usuario_id, tipo, valor, descricao) VALUES ($1, $2, $3, $4)',
      [null, 'comissao_plataforma', valorTaxa, `Comissão da disputa ID ${id}`]
    );

    await db.query('COMMIT');

    res.status(200).json({ message: 'Disputa finalizada com sucesso!', premio: valorPremio });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Erro ao finalizar disputa:', error);
    res.status(500).json({ error: 'Erro ao finalizar disputa.' });
  }
});


// ROTA 6: Contestar o resultado de uma disputa (POST /api/disputas/:id/contestar)
router.post('/:id/contestar', async (req, res) => {
  const { id } = req.params;
  const { usuario_id, arquivo_prova_url } = req.body;

  if (!id || !usuario_id) {
    return res.status(400).json({ error: 'ID da disputa e ID do usuário são obrigatórios.' });
  }

  try {
    await db.query('BEGIN');

    // 1. Atualiza o status da disputa para 'contestada'
    await db.query('UPDATE disputas SET status = $1 WHERE id = $2', ['contestada', id]);

    // 2. Atualiza o resultado para 'em análise'
    await db.query(
      'UPDATE resultados_disputa SET status_final = $1 WHERE disputa_id = $2',
      ['analise_plataforma', id]
    );

    // 3. Opcional: Salva a URL da prova (você pode implementar o upload de arquivos depois)
    if (arquivo_prova_url) {
      // Aqui você adicionaria a lógica para salvar o arquivo em um serviço como S3
      // e salvar a URL no banco. Por ora, vamos apenas registrar na tabela de resultados.
      console.log(`Prova enviada para o usuário ${usuario_id} na disputa ${id}: ${arquivo_prova_url}`);
    }

    await db.query('COMMIT');

    res.status(200).json({ message: 'Disputa contestada com sucesso! A análise será feita pela plataforma.' });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Erro ao contestar disputa:', error);
    res.status(500).json({ error: 'Erro ao contestar disputa.' });
  }
});


// --- ROTA DE TESTE: Criar um novo usuário (POST /api/disputas/usuarios) ---
// CORRIGIDO para usar as colunas 'email' e 'senha_hash' da sua tabela
router.post('/usuarios', async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' });
  }
  try {
    // Em um app real, a senha seria hasheada! Ex: bcrypt.hashSync(senha, 10)
    // Por enquanto, vamos salvar direto, mas é uma boa prática usar um hash.
    const senha_hash = senha; // MUDADO: usa 'senha_hash'
    
    const newUser = await db.query(
      'INSERT INTO usuarios (nome, email, senha_hash, saldo) VALUES ($1, $2, $3, $4) RETURNING id, nome, saldo', // MUDADO: usa 'email'
      [nome, email, senha_hash, 1000.0]
    );
    res.status(201).json(newUser.rows[0]);
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({ error: 'Erro ao criar usuário.' });
  }
});


module.exports = router;