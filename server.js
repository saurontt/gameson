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

// O resto do seu código começa aqui
const express = require('express');
const cors = require('cors');
const db = require('./db');
const disputasRoutes = require('./routes/disputas');
const feedRoutes = require('./routes/feed'); // A linha que está dando erro

// server.js - O arquivo principal que inicia o servidor
const express = require('express');
const cors = require('cors');
const db = require('./db');
const disputasRoutes = require('./routes/disputas');
const feedRoutes = require('./routes/feed');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send('API da Plataforma de Disputas está no ar!'));
app.use('/api/disputas', disputasRoutes);
app.use('/api/disputas', feedRoutes);

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});