// routes/disputas.js - Lógica para Disputas Pessoais Avançadas
const express = require('express');
const db = require('../db');
const router = express.Router();

// --- ROTAS DA API ---

// ROTA 1: Criar um novo desafio (POST /api/disputas)
// O criador propõe um valor. O desafiado ainda aceitou.
router.post('/', async (req, res) => {
  const { criador_id, desafiado_id, titulo, valor_aposta_criador } = req.body;

  if (!criador_id || !desafiado_id || !titulo || !valor_aposta_criador) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
  }

  try {
    await db.query('BEGIN');

    // CORREÇÃO: A query agora insere um valor na coluna antiga 'valor_aposta' para não violar a constraint NOT NULL
    const newDisputa = await db.query(
      'INSERT INTO disputas (criador_id, desafiado_id, titulo, valor_aposta, valor_aposta_criador, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [criador_id, desafiado_id, titulo, valor_aposta_criador, valor_aposta_criador, 'aguardando_aceite']
    );

    // 2. Cria a transação da aposta do criador (valor fica "congelado")
    await db.query(
      'INSERT INTO transacoes (usuario_id, tipo, valor, descricao, disputa_id) VALUES ($1, $2, $3, $4, $5)',
      [criador_id, 'aposta_desafio', -valor_aposta_criador, `Aposta no desafio "${titulo}"`, newDisputa.rows[0].id]
    );

    await db.query('COMMIT');
    res.status(201).json(newDisputa.rows[0]);

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Erro ao criar desafio:', error);
    res.status(500).json({ error: 'Erro ao criar o desafio.' });
  }
});

// ROTA 2: Listar desafios com status 'aguardando_aceite' (GET /api/disputas/abertos)
// CORREÇÃO: A query agora usa LEFT JOIN para funcionar com disputas antigas
router.get('/abertos', async (req, res) => {
  try {
    const query = `
      SELECT
        d.id,
        d.titulo,
        d.valor_aposta_criador,
        d.data_criacao,
        u_criador.nome AS criador_nome,
        u_desafiado.nome AS desafiado_nome
      FROM
        disputas d
      JOIN
        usuarios u_criador ON d.criador_id = u_criador.id
      LEFT JOIN -- CORREÇÃO: Usar LEFT JOIN para não falhar se desafiado_id for NULL
        usuarios u_desafiado ON d.desafiado_id = u_desafiado.id
      WHERE
        d.status = 'aguardando_aceite'
      ORDER BY
        d.data_criacao DESC
    `;

    const result = await db.query(query);
    res.status(200).json(result.rows);

  } catch (error) {
    console.error('Erro ao buscar desafios abertos:', error);
    res.status(500).json({ error: 'Erro ao buscar desafios.' });
  }
});

// ROTA 3: Aceitar um desafio e contra-apostar (POST /api/disputas/:id/aceitar)
router.post('/:id/aceitar', async (req, res) => {
  const { id } = req.params;
  const { usuario_id, valor_aposta_desafiado } = req.body;

  if (!id || !usuario_id || !valor_aposta_desafiado) {
    return res.status(400).json({ error: 'ID da disputa, ID do usuário e valor da aposta são obrigatórios.' });
  }

  try {
    await db.query('BEGIN');

    // 1. Busca a disputa para validar
    const disputaQuery = await db.query('SELECT * FROM disputas WHERE id = $1 AND desafiado_id = $2', [id, usuario_id]);
    if (disputaQuery.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Desafio não encontrado ou você não é o desafiado.' });
    }
    if (disputaQuery.rows[0].status !== 'aguardando_aceite') {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Este desafio já foi respondido.' });
    }

    // 2. Atualiza a disputa com o valor do desafiado e muda o status
    await db.query(
      'UPDATE disputas SET valor_aposta_desafiado = $1, status = $2 WHERE id = $3',
      [valor_aposta_desafiado, 'aguardando', id]
    );

    // 3. Cria a transação da aposta do desafiado
    await db.query(
      'INSERT INTO transacoes (usuario_id, tipo, valor, descricao, disputa_id) VALUES ($1, $2, $3, $4, $5)',
      [usuario_id, 'aposta_desafio', -valor_aposta_desafiado, `Aposta no desafio ID ${id}`, id]
    );

    await db.query('COMMIT');
    res.status(200).json({ message: 'Desafio aceito com sucesso! A aposta está ativa.' });

  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Erro ao aceitar desafio:', error);
    res.status(500).json({ error: 'Erro ao aceitar o desafio.' });
  }
});

// ROTA 4: Finalizar uma disputa por consenso (POST /api/disputas/:id/finalizar)
router.post('/:id/finalizar', async (req, res) => {
  const { id } = req.params;
  const { vencedor_usuario_id } = req.body;

  if (!id || !vencedor_usuario_id) {
    return res.status(400).json({ error: 'ID da disputa e ID do vencedor são obrigatórios.' });
  }

  try {
    const disputa = await db.query('SELECT valor_aposta_criador, valor_aposta_desafiado FROM disputas WHERE id = $1', [id]);
    if (disputa.rows.length === 0) return res.status(404).json({ error: 'Disputa não encontrada.' });

    const valorTotal = parseFloat(disputa.rows[0].valor_aposta_criador) + parseFloat(disputa.rows[0].valor_aposta_desafiado);
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
      [vencedor_usuario_id, 'ganho_desafio', valorPremio, `Ganho na disputa ID ${id}`, id]
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

// ROTA 5: Contestar o resultado de uma disputa (POST /api/disputas/:id/contestar)
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

    // 3. Opcional: Salva a URL da prova
    if (arquivo_prova_url) {
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

// ROTA DE TESTE: Criar um novo usuário (POST /api/disputas/usuarios)
router.post('/usuarios', async (req, res) => {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' });
  }
  try {
    const senha_hash = senha; 
    
    const newUser = await db.query(
      'INSERT INTO usuarios (nome, email, senha_hash, saldo) VALUES ($1, $2, $3, $4) RETURNING id, nome, saldo',
      [nome, email, senha_hash, 1000.0]
    );
    res.status(201).json(newUser.rows[0]);
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({ error: 'Erro ao criar usuário.' });
  }
});

module.exports = router;