const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

let lastExtraction = [];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

const extractCNISData = async (buffer) => {
  const data = await pdfParse(buffer);
  const text = data.text;
  const regex = /(\d{2}\/\d{4})\D+(\d{1,3}(?:\.\d{3})*,\d{2})/g;
  const contributions = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const date = match[1];
    const value = parseFloat(match[2].replace(/\./g, '').replace(',', '.'));
    contributions.push({ data: date, valor: value });
  }

  return contributions;
};

const calcularRMI = (contributions) => {
  if (!contributions.length) return 0;
  const validValues = contributions.filter(c => typeof c.valor === 'number' && !isNaN(c.valor) && c.valor > 0);
  if (!validValues.length) return 0;
  const sorted = [...validValues].sort((a, b) => b.valor - a.valor);
  const countToUse = Math.max(Math.floor(sorted.length * 0.8), 1);
  const top80 = sorted.slice(0, countToUse);
  const media = top80.reduce((acc, curr) => acc + curr.valor, 0) / top80.length;
  return parseFloat((media * 0.5).toFixed(2));
};

// Página HTML interativa
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Upload CNIS</title></head>
      <body>
        <h2>Enviar PDF do CNIS</h2>
        <form action="/enviar" method="post" enctype="multipart/form-data">
          <input type="file" name="arquivo" accept="application/pdf" required />
          <button type="submit">Enviar</button>
        </form>
      </body>
    </html>
  `);
});

// Rota para upload via formulário
app.post('/enviar', upload.single('arquivo'), async (req, res) => {
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const result = await extractCNISData(fileBuffer);
    fs.unlinkSync(req.file.path);

    lastExtraction = result;

    res.send(`
      <h3>Puxado dados com sucesso!</h3>
      <form action="/ver" method="get">
        <button type="submit">Ver dados extraídos</button>
      </form>
      <form action="/calcular" method="get">
        <button type="submit">Calcular RMI</button>
      </form>
    `);
  } catch (error) {
    console.error('Erro ao processar o PDF:', error);
    res.status(500).send('Erro ao processar o arquivo.');
  }
});

app.get('/ver', (req, res) => {
  res.send(`
    <h3>Dados extraídos:</h3>
    <pre>${JSON.stringify(lastExtraction, null, 2)}</pre>
    <a href="/">Voltar</a>
  `);
});

app.get('/calcular', (req, res) => {
  const rmi = calcularRMI(lastExtraction);
  res.send(`
    <h3>RMI calculada: R$ ${rmi.toFixed(2)}</h3>
    <a href="/">Voltar</a>
  `);
});

// API via Make: extrair dados do PDF
app.post('/api/extrair-cnis', upload.single('arquivo'), async (req, res) => {
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const result = await extractCNISData(fileBuffer);
    fs.unlinkSync(req.file.path);
    res.json(result);
  } catch (error) {
    console.error('Erro ao processar o PDF:', error);
    res.status(500).json({ erro: 'Erro ao processar o arquivo.' });
  }
});

// API via Make: cálculo da RMI (recebe lista JSON)
app.post('/api/calcular-rmi', (req, res) => {
  try {
    const lista = req.body;
    const rmi = calcularRMI(lista);
    res.json({ rmi });
  } catch (err) {
    console.error('Erro ao calcular RMI:', err);
    res.status(400).json({ erro: 'Erro no cálculo da RMI' });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
