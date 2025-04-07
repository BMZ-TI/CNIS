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
  const lines = text.split('\n');

  const regex = /(\d{2}\/\d{4})\D+(\d{1,3}(?:\.\d{3})*,\d{2})/g;
  const regexData = /(\d{2}\/\d{2}\/\d{4})/;

  const contributions = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
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
            </form>
          </div>
        </div>
        <footer><p>©Sistema de Cálculo Jurídico da BMZ Advogados Associados</p></footer>

        <script>
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
                  \`✅ RMI: R$ \${resultado.rmi?.toFixed(2)}\\n📆 Total vencidas: R$ \${resultado.totalVencidas?.toFixed(2)}\`
                );
              }
            } catch (err) {
              console.error(err);
              alert("❌ Erro ao calcular.");
            }
          }
        </script>
      </body>
    </html>
  `); // <== FECHAMENTO do res.send()
});

// ✅ Final do arquivo: iniciar o servidor
app.listen(port, () => {
  console.log(\`Servidor rodando em http://localhost:\${port}\`);
});

