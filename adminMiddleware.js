// src/middleware/adminMiddleware.js

const db = require('../db'); // Usando a conexão com o banco diretamente

const adminMiddleware = async (req, res, next) => {
    try {
        // O ID do usuário logado deve vir de um middleware de autenticação (ex: req.usuarioId)
        // Se você não tiver, precisará implementar a autenticação primeiro.
        // Por ora, vou assumir que req.usuarioId existe.
        const usuarioId = req.usuarioId; 

        if (!usuarioId) {
            return res.status(401).json({ error: 'Usuário não autenticado.' });
        }

        const result = await db.query('SELECT "isAdmin" FROM usuarios WHERE id = $1', [usuarioId]);

        if (result.rows.length === 0 || !result.rows[0].isAdmin) {
            return res.status(403).json({ error: 'Acesso negado. Ação permitida apenas para administradores.' });
        }

        next(); // É um admin, pode continuar
    } catch (error) {
        console.error('Erro no middleware de admin:', error);
        res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};

module.exports = adminMiddleware;