// src/middleware/adminMiddleware.js
const usuarioModel = require('../models/usuarioModel'); // Assumindo que você tem um modelo de usuário

const adminMiddleware = async (req, res, next) => {
    try {
        const usuarioId = req.usuarioId; // ID do usuário logado, vindo do authMiddleware
        const usuario = await usuarioModel.buscarPorId(usuarioId);

        if (!usuario || !usuario.isAdmin) { // Assumindo que sua tabela 'usuarios' tem um campo booleano 'isAdmin'
            return res.status(403).json({ error: 'Acesso negado. Ação permitida apenas para administradores.' });
        }

        next(); // É um admin, pode continuar
    } catch (error) {
        console.error('Erro no middleware de admin:', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};

module.exports = adminMiddleware;