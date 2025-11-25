// src/routes/adminRoutes.js

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware'); // Middleware que verifica se o usuário está logado
const adminMiddleware = require('../middleware/adminMiddleware'); // Middleware que verifica se é admin

// Aplica os middlewares em todas as rotas de admin
// A ordem importa: primeiro verifica se está logado, depois se é admin
router.use(authMiddleware);
router.use(adminMiddleware);

// Rota para buscar todas as configurações do sistema
router.get('/config', adminController.getConfiguracoes);

// Rota para atualizar uma configuração específica (ex: a taxa)
router.put('/config/:chave', adminController.atualizarConfiguracao);

module.exports = router;