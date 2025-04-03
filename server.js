const express = require('express');
const multer = require('multer');
const pdfjsLib = require('pdfjs-dist');
const pdfParse = require('pdf-parse');
const cors = require('cors');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());

// Configuração do upload
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

// Função para extrair dados do PDF
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

// Rota principal
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
