// server.js

const express = require('express');
const path = require('path');
const fs = require('fs'); // Módulo para interagir com o sistema de arquivos

// Importa as rotas
const feedRoutes = require('./routes/feed');
const disputasRoutes = require('./routes/disputas');
const campeonatosRoutes = require('./routes/campeonatos');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para servir arquivos estáticos da pasta raiz do projeto
// Onde está o seu index.html
app.use(express.static(__dirname));

// Middleware para o Express entender JSON
app.use(express.json());

// --- DEFINE AS ROTAS DA API ---
app.use('/api/feed', feedRoutes);
app.use('/api/disputas', disputasRoutes);
app.use('/api/campeonatos', campeonatosRoutes);

// Rota de saúde para o Render
app.get('/', (req, res) => {
  res.status(200).send('API da GamesOn está no ar!');
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);

  // >>> LINHA DE DIAGNÓSTICO <<<
  // Lista todos os arquivos na pasta do projeto quando o servidor inicia
  fs.readdir(__dirname, (err, files) => {
    if (err) {
      console.error("Erro ao ler o diretório:", err);
      return;
    }
    console.log("--- Arquivos que o Render vê na pasta raiz ---");
    console.log(files);
    console.log("--------------------------------------------");
  });
});