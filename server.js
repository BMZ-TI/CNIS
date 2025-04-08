const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const cors = require('cors');
const fs = require('fs');
const { calcularValorDaCausa, gerarTextoValorCausa } = require('./scr/components/CalculoValorDaCausa');

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
  }
});
const upload = multer({ storage });

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
              <button onclick="gerarTextoPeticao(event)">Gerar resultado</button>
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
              const html = '<h3>Resultado:</h3>' +
                           '<textarea rows="6" style="width:100%; padding:1rem; font-size:1rem;">' +
                           resultado.texto + '</textarea>';
              document.getElementById("resultadoTexto").innerHTML = html;
            }
          } catch (err) {
            console.error(err);
            alert("❌ Erro ao gerar resultado.");
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
    res.json({ sucesso: true, dadosExtraidos: resultado });
  } catch (error) {
    console.error('Erro ao extrair dados do CNIS:', error);
    res.status(500).json({ erro: 'Erro ao extrair dados do CNIS.' });
  }
});

app.post('/api/valor-da-causa', upload.single('arquivo'), async (req, res) => {
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const textoExtraido = await extractCNISData(fileBuffer);
    fs.unlinkSync(req.file.path);

    const { contributions, dib: dibExtraida } = textoExtraido;
    const dib = req.body.DIB || dibExtraida;
    
    console.log('📥 DIB recebida:', dib);
    console.log('📥 Número de contribuições:', contributions.length);

    if (!dib) return res.status(400).json({ erro: 'DIB não informada.' });

    const resultado = calcularValorDaCausa({ contributions, dib });
    console.log('📊 Resultado calculado:', resultado);

    const texto = gerarTextoValorCausa(resultado);
    res.json({ texto });

  } catch (error) {
    console.error('❌ Erro ao calcular valor da causa:', error);
    res.status(500).json({ erro: 'Erro ao calcular valor da causa.' });
  }
});


app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
