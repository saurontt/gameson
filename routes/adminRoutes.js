const express = require('express');
const router = express.Router();
const adminController = require('./adminController'); // Controller na mesma pasta 'routes'
const authMiddleware = require('../middleware/authMiddleware'); // Middleware na pasta 'middleware'
const adminMiddleware = require('../middleware/adminMiddleware'); // Middleware na pasta 'middleware'

// Aplica os middlewares em todas as rotas de admin
router.use(authMiddleware);
router.use(adminMiddleware);

// Rota para buscar todas as configurações do sistema
router.get('/config', adminController.getConfiguracoes);

// Rota para atualizar uma configuração específica (ex: a taxa)
router.put('/config/:chave', adminController.atualizarConfiguracao);

module.exports = router;