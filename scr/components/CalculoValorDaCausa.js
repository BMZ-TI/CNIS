// scr/components/CalculoValorDaCausa.js

const calcularValorDaCausa = ({ contribuições, dib }) => {
  const dayjs = require('dayjs');
  const customParse = require('dayjs/plugin/customParseFormat');
  const fs = require('fs');
  dayjs.extend(customParse);

  const correcaoMonetaria = JSON.parse(
    fs.readFileSync('./dados/correcao_monetaria_unificada_1965_2025_CORRIGIDO.json', 'utf8')
  );

  const inpcAnual = JSON.parse(
    fs.readFileSync('./dados/inpc_anual_oficial_1990_2024.json', 'utf8')
  );

  const formatar = (valor) => Number(valor.toFixed(2));

  const corrigirContribuições = () => {
    const vencidas = [];

    for (const c of contribuições) {
      const [mes, ano] = c.data.split('/');
      const chave = `${mes.padStart(2, '0')}/${ano}`;

      const fator = correcaoMonetaria[chave];
      if (!fator) continue;

      vencidas.push({
        ...c,
        valorCorrigido: c.valor * fator,
      });
    }

    return vencidas;
  };

  const calcularRMI = () => {
    const validos = contribuições.filter(c => typeof c.valor === 'number' && c.valor > 0);
    if (validos.length === 0) return 0;

    const ordenados = [...validos].sort((a, b) => b.valor - a.valor);
    const usados = ordenados.slice(0, Math.floor(ordenados.length * 0.8));

    const media = usados.reduce((acc, cur) => acc + cur.valor, 0) / usados.length;
    return formatar(media * 0.5);
  };

  const calcularParcelasVencidas = (rmi) => {
    if (!dib || !dayjs(dib, 'DD/MM/YYYY').isValid()) return { total: null, meses: 0 };

    const inicio = dayjs(dib, 'DD/MM/YYYY');
    const fim = dayjs();
    const meses = fim.diff(inicio, 'month');

    const vencidas = [];
    for (let i = 0; i < meses; i++) {
      const dataRef = inicio.add(i, 'month');
      const chave = `${dataRef.format('MM')}/${dataRef.format('YYYY')}`;
      const fator = correcaoMonetaria[chave] || 1;
      vencidas.push(rmi * fator);
    }

    const total = vencidas.reduce((a, b) => a + b, 0);
    return {
      total: formatar(total),
      meses,
    };
  };

  const calcularParcelasVincendas = (rmi) => {
    return formatar(rmi * 13);
  };

  const rmi = calcularRMI();
  const vencidas = calcularParcelasVencidas(rmi);
  const vincendas = calcularParcelasVincendas(rmi);

  return {
    rmi,
    vencidas,
    vincendas,
    total: vencidas.total !== null ? formatar(vencidas.total + vincendas) : null,
    mesesVencidos: vencidas.meses,
  };
};
const gerarTextoValorCausa = ({ rmi, vencidas, vincendas, total }) => {
  const formatarMoeda = (valor) =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const formatarExtenso = (valor) => {
    const extenso = require('extenso');
    return extenso(valor.toFixed(2).replace('.', ','), { mode: 'currency' });
  };

  return `Atribui-se à causa o valor de ${formatarMoeda(total)} (${formatarExtenso(total)}), ` +
         `sendo ${formatarMoeda(vencidas)} (${formatarExtenso(vencidas)}) referente às parcelas vencidas ` +
         `e ${formatarMoeda(vincendas)} (12 vincendas + 13º = 13 x ${formatarMoeda(rmi)}) (${formatarExtenso(vincendas)}) ` +
         `referente às parcelas vincendas, conforme cálculo em anexo.`;
};


module.exports = {
  calcularValorDaCausa,
  gerarTextoValorCausa
};

