// INÍCIO DO CÓDIGO DE DEBUG
const fs = require('fs');
const path = require('path');

console.log('--- Arquivos que o Render vê na pasta "routes" ---');
try {
  const files = fs.readdirSync(path.join(__dirname, 'routes'));
  console.log(files);
} catch (err) {
  console.error('Erro ao ler a pasta "routes":', err);
}
console.log('----------------------------------------------------');
// FIM DO CÓDIGO DE DEBUG

// O RESTO DO SEU CÓDIGO COMEÇA AQUI

const express = require('express');
const cors = require('cors');
const db = require('./db');
const disputasRoutes = require('./routes/disputas');
const campeonatosRoutes = require('./routes/campeonatos'); // <-- ADICIONE ESTA LINHA

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send('API da Plataforma de Disputas e Campeonatos está no ar!'));

// CORREÇÃO: Rotas para disputas e campeonatos, cada uma com seu próprio caminho
app.use('/api/disputas', disputasRoutes);
app.use('/api/campeonatos', campeonatosRoutes); // <-- ADICIONE ESTA LINHA

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});