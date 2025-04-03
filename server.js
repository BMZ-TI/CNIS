const express = require('express');
const multer = require('multer');
const pdfjsLib = require('pdfjs-dist');
const pdfParse = require('pdf-parse');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

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

// Página de formulário HTML
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

// Formulário manual (via navegador)
app.post('/enviar', upload.single('arquivo'), async (req, res) => {
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const result = await extractCNISData(fileBuffer);
    fs.unlinkSync(req.file.path);

    res.send(`
      <h3>Resultado extraído:</h3>
      <pre>${JSON.stringify(result, null, 2)}</pre>
      <a href="/">Voltar</a>
    `);
  } catch (error) {
    console.error('Erro ao processar o PDF:', error);
    res.status(500).send('Erro ao processar o arquivo.');
  }
});

// API para uso externo (Make, etc)
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

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
