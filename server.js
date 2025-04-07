const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const cors = require('cors');
const fs = require('fs');
const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat');
const { calcularValorDaCausa, gerarTextoValorCausa } = require('./scr/components/CalculoValorDaCausa');

dayjs.extend(customParseFormat);

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

// Upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// Extração de dados do CNIS
const extractCNISData = async (buffer) => {
  const data = await pdfParse(buffer);
  const text = data.text;
  const lines = text.split('\n');

  const regexContrib = /(\d{2}\/\d{4})\D+(\d{1,3}(?:\.\d{3})*,\d{2})/g;
  const regexData = /(\d{2}\/\d{2}\/\d{4})/;

  const contributions = [];
  let match;

  while ((match = regexContrib.exec(text)) !== null) {
    const date = match[1];
    const value = parseFloat(match[2].replace(/\./g, '').replace(',', '.'));
    contributions.push({ data: date, valor: value });
  }

  let dib = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/NB\s+\d+/.test(line) || /Data In[ií]cio/.test(line)) {
      for (let j = 0; j <= 3; j++) {
        const targetLine = lines[i + j];
        const dateMatch = targetLine && targetLine.match(regexData);
        if (dateMatch) {
          dib = dateMatch[1];
          break;
        }
      }
      if (dib) break;
    }
  }

  return { contributions, dib };
};

// Cálculo da RMI
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

// Cálculo das vencidas
const calcularVencidas = (dibStr, rmi, hoje = dayjs()) => {
   dib = dayjs(dibStr, 'YYYY-MM-DD');
  if (!dib.isValid()) dib = dayjs(dibStr, 'DD/MM/YYYY');
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

// Rota principal
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>CJ BMZ</title>
        <link rel="stylesheet" href="/style.css">
      </head>
      <body>
        <div class="titulo">
          <h1>Sistema de Cálculo Jurídico BMZ</h1>
        </div>
        <div class="container">
          <div class="item">
            <form id="formulario">
              <input type="file" name="arquivo" accept="application/pdf" required />
              <br><br>
              <h3>Informe a DIB</h3>
              <label for="dibInput">Data de Início do Benefício:</label>
              <input type="date" id="dibInput" name="dib" required />
              <br><br>
              <button onclick="enviarCalculo(event)">Calcular RMI</button>
              <button onclick="gerarTextoPeticao(event)">Gerar texto para petição</button>
              <button onclick="verificarCNIS(event)">Ver dados do CNIS</button>
            </form>
            <div id="resultadoTexto" style="margin-top: 2rem;"></div>
          </div>
        </div>
        <footer><p>©Sistema de Cálculo Jurídico da BMZ Advogados Associados</p></footer>
        <script>
        async function verificarCNIS(event) {
  event.preventDefault();

  const arquivo = document.querySelector('input[name="arquivo"]').files[0];
  if (!arquivo) {
    alert("Selecione um arquivo PDF primeiro.");
    return;
  }

  const formData = new FormData();
  formData.append("arquivo", arquivo);

  try {
    const resposta = await fetch("/api/verificar-dados-cnis", {
      method: "POST",
      body: formData
    });

    const json = await resposta.json();

    if (json.erro) {
      alert("Erro ao extrair dados do CNIS.");
    } else {
      document.getElementById("resultadoTexto").innerHTML =
        "<pre>" + JSON.stringify(json.dadosExtraidos, null, 2) + "</pre>";
    }
  } catch (err) {
    console.error(err);
    alert("Erro ao tentar extrair dados do CNIS.");
  }
}

          async function enviarCalculo(event) {
    event.preventDefault();
    const dib = document.getElementById("dibInput").value;
    const arquivo = document.querySelector('input[name="arquivo"]').files[0];

    if (!dib || !arquivo) {
      alert("Por favor, selecione o PDF e informe a DIB.");
      return;
    }

    const formData = new FormData();
    formData.append("arquivo", arquivo);
    formData.append("DIB", dib);

    try {
      const resposta = await fetch("/api/calculo-final", {
        method: "POST",
        body: formData
      });

      const resultado = await resposta.json();

      if (resultado.erro) {
        alert("Erro: " + resultado.erro);
      } else {
        alert(
          "✅ RMI: R$ " + resultado.rmi?.toFixed(2) + 
          "\\n📆 Total vencidas: R$ " + resultado.totalVencidas?.toFixed(2)
        );
      }
    } catch (err) {
      console.error(err);
      alert("❌ Erro ao calcular.");
    }
  }

  async function gerarTextoPeticao(event) {
    event.preventDefault();

    const dib = document.getElementById("dibInput").value;
    const arquivo = document.querySelector('input[name="arquivo"]').files[0];

    if (!dib || !arquivo) {
      alert("Por favor, selecione o PDF e informe a DIB.");
      return;
    }

    const formData = new FormData();
    formData.append("arquivo", arquivo);
    formData.append("DIB", dib);

    try {
      const resposta = await fetch("/api/valor-da-causa", {
        method: "POST",
        body: formData
      });

      const resultado = await resposta.json();

      if (resultado.erro) {
        alert("Erro: " + resultado.erro);
      } else {
        const html = '<h3>Texto gerado:</h3>' +
                     '<textarea rows="6" style="width:100%; padding:1rem; font-size:1rem;">' +
                     resultado.texto + '</textarea>';
        document.getElementById("resultadoTexto").innerHTML = html;
      }
    } catch (err) {
      console.error(err);
      alert("❌ Erro ao gerar texto.");
    }
  }
        </script>
      </body>
    </html>
  `);
});
app.post('/api/verificar-dados-cnis', upload.single('arquivo'), async (req, res) => {
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const resultado = await extractCNISData(fileBuffer);
    fs.unlinkSync(req.file.path);

    res.json({
      sucesso: true,
      dadosExtraidos: resultado
    });
  } catch (error) {
    console.error('Erro ao extrair dados do CNIS:', error);
    res.status(500).json({ erro: 'Erro ao extrair dados do CNIS.' });
  }
});


app.post('/api/calculo-final', upload.single('arquivo'), async (req, res) => {
  try {
    const fileBuffer = req.file.buffer;
    const { contributions, dib: dibExtraida } = await extractCNISData(fileBuffer);

    const dib = req.body.DIB || dibExtraida;
    if (!dib) return res.status(400).json({ erro: 'DIB não informada.' });

    const rmi = calcularRMI(contributions);
    const vencidas = calcularVencidas(dib, rmi);

    res.json({
      rmi,
      totalVencidas: vencidas.totalGeral,
      detalhes: vencidas,
      dib
    });
  } catch (error) {
    console.error('❌ Erro no cálculo final:', error);
    res.status(500).json({ erro: 'Erro no cálculo final.' });
  }
});

app.post('/api/valor-da-causa', upload.single('arquivo'), async (req, res) => {
  try {
    const fileBuffer = req.file.buffer;
    const textoExtraido = await extractCNISData(fileBuffer);

    const { contributions, dib } = textoExtraido;
    const resultado = calcularValorDaCausa({ contribuições: contributions, dib });

    const texto = gerarTextoValorCausa(resultado);

    res.json({ texto });
  } catch (error) {
    console.error('Erro ao calcular valor da causa:', error);
    res.status(500).json({ erro: 'Erro ao calcular valor da causa.' });
  }
});


app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
