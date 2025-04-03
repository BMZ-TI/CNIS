const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
dayjs.extend(customParseFormat);

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

let lastExtraction = [];
let lastDIB = null;

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
  const regexDIB = /NB\s+\d+\s+\d{2}\s+-\s+.*?(\d{2}\/\d{2}\/\d{4})/;

  const contributions = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const date = match[1];
    const value = parseFloat(match[2].replace(/\./g, '').replace(',', '.'));
    contributions.push({ data: date, valor: value });
  }

  const dibMatch = regexDIB.exec(text);
  const dib = dibMatch ? dibMatch[1] : null;

  return { contributions, dib };
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

const calcularVencidas = (dibStr, rmi, hoje = dayjs()) => {
  let dib = dayjs(dibStr, 'DD/MM/YYYY');
  if (!dib.isValid()) dib = dayjs(dibStr);
  if (!dib.isValid()) return { erro: 'DIB inválida' };

  const diffMeses = hoje.diff(dib, 'month') + 1;
  const totalMensal = diffMeses * rmi;

  const qtd13 = hoje.year() - dib.year() + 1;
  const total13 = qtd13 * rmi;

  return {
    meses: diffMeses,
    decimos: qtd13,
    totalMensal: parseFloat(totalMensal.toFixed(2)),
    total13: parseFloat(total13.toFixed(2)),
    totalGeral: parseFloat((totalMensal + total13).toFixed(2))
  };
};

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

app.post('/enviar', upload.single('arquivo'), async (req, res) => {
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const { contributions, dib } = await extractCNISData(fileBuffer);
    fs.unlinkSync(req.file.path);

    lastExtraction = contributions;
    lastDIB = dib;

    const rmi = calcularRMI(contributions);
    const vencidas = calcularVencidas(dib, rmi);

    res.send(`
      <h3>Puxado dados com sucesso!</h3>
      <p><strong>DIB:</strong> ${dib || 'não encontrada'}</p>
      <p><strong>RMI:</strong> R$ ${rmi.toFixed(2)}</p>
      <p><strong>Total vencidas:</strong> R$ ${vencidas.totalGeral}</p>
      <form action="/ver" method="get">
        <button type="submit">Ver dados extraídos</button>
      </form>
      <form action="/calcular" method="get">
        <button type="submit">Ver detalhes RMI</button>
      </form>
      <form action="/vencidas" method="get">
        <input type="hidden" name="dib" value="${dib}" />
        <input type="hidden" name="rmi" value="${rmi}" />
        <button type="submit">Ver detalhes vencidas</button>
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

app.get('/vencidas', (req, res) => {
  const { dib, rmi } = req.query;
  const resultado = calcularVencidas(dib, parseFloat(rmi));
  if (resultado.erro) return res.send(`<h3>${resultado.erro}</h3><a href="/">Voltar</a>`);
  res.send(`
    <h3>Resultado das Parcelas Vencidas</h3>
    <ul>
      <li>Meses: ${resultado.meses}</li>
      <li>13ºs: ${resultado.decimos}</li>
      <li>Total mensal: R$ ${resultado.totalMensal}</li>
      <li>Total 13º: R$ ${resultado.total13}</li>
      <li><b>Total geral: R$ ${resultado.totalGeral}</b></li>
    </ul>
    <a href="/">Voltar</a>
  `);
});

app.post('/api/extrair-cnis', upload.single('arquivo'), async (req, res) => {
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const { contributions, dib } = await extractCNISData(fileBuffer);
    fs.unlinkSync(req.file.path);
    res.json({ contributions, dib });
  } catch (error) {
    console.error('Erro ao processar o PDF:', error);
    res.status(500).json({ erro: 'Erro ao processar o arquivo.' });
  }
});

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

app.post('/api/calcular-vencidas', (req, res) => {
  try {
    const { dib, rmi } = req.body;
    const resultado = calcularVencidas(dib, parseFloat(rmi));
    res.json(resultado);
  } catch (err) {
    console.error('Erro ao calcular vencidas:', err);
    res.status(400).json({ erro: 'Erro no cálculo de parcelas vencidas' });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
