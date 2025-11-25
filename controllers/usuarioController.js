const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const usuarioController = {
    registrar: async (req, res) => {
        try {
            const { nome, email, senha } = req.body;
            if (!nome || !email || !senha) {
                return res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' });
            }
            const usuarioExistente = await db.query('SELECT id FROM usuarios WHERE email = $1', [email]);
            if (usuarioExistente.rows.length > 0) {
                return res.status(400).json({ error: 'Este e-mail já está em uso.' });
            }
            const hashedSenha = await bcrypt.hash(senha, 10);
            const novoUsuario = await db.query(
                'INSERT INTO usuarios (nome, email, senha) VALUES ($1, $2, $3) RETURNING id, nome, email',
                [nome, email, hashedSenha]
            );
            res.status(201).json({ message: 'Usuário criado com sucesso!', usuario: novoUsuario.rows[0] });
        } catch (error) {
            console.error('Erro ao registrar usuário:', error);
            res.status(500).json({ error: 'Erro interno no servidor.' });
        }
    },

    login: async (req, res) => {
        try {
            const { email, senha } = req.body;
            if (!email || !senha) {
                return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
            }
            const usuarioQuery = await db.query('SELECT * FROM usuarios WHERE email = $1', [email]);
            if (usuarioQuery.rows.length === 0) {
                return res.status(401).json({ error: 'Credenciais inválidas.' });
            }
            const usuario = usuarioQuery.rows[0];

            // >>> LINHA DE DIAGNÓSTICO <<<
            console.log("Objeto 'usuario' recebido do banco:", usuario);

            const senhaValida = await bcrypt.compare(senha, usuario.senha);
            if (!senhaValida) {
                return res.status(401).json({ error: 'Credenciais inválidas.' });
            }
            const token = jwt.sign({ id: usuario.id, email: usuario.email }, process.env.JWT_SECRET || 'sua_chave_secreta_padrao', { expiresIn: '1h' });
            res.status(200).json({
                message: 'Login realizado com sucesso!',
                token: token,
                usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, isAdmin: usuario.isAdmin }
            });
        } catch (error) {
            console.error('Erro ao fazer login:', error);
            res.status(500).json({ error: 'Erro interno no servidor.' });
        }
    }
};

module.exports = usuarioController;
