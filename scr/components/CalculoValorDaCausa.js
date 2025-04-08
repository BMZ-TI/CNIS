const calcularValorDaCausa = ({ contributions, dib }) => {
  const dayjs = require('dayjs');
  const customParseFormat = require('dayjs/plugin/customParseFormat');
  const fs = require('fs');
  dayjs.extend(customParseFormat);

  const correcaoMonetaria = JSON.parse(
    fs.readFileSync('./dados/correcao_monetaria_unificada_1965_2025_CORRIGIDO.json', 'utf8')
  );

  const formatar = (valor) => Number(valor.toFixed(2));

  const filtrarContribuicoesValidas = () => {
    return contributions.filter(c => {
      const [mes, ano] = c.data.split('/');
      const data = dayjs(`01/${mes}/${ano}`, 'DD/MM/YYYY');
      return (
        typeof c.valor === 'number' &&
        c.valor > 0 &&
        data.isValid() &&
        data.isAfter('1994-03-31')
      );
    });
  };

  const calcularRMI = () => {
    const validos = filtrarContribuicoesValidas();
    if (validos.length === 0) return 0;

    const ordenados = [...validos].sort((a, b) => b.valor - a.valor);
    const usados = ordenados.slice(0, Math.floor(ordenados.length * 0.8));
    const media = usados.reduce((acc, cur) => acc + cur.valor, 0) / usados.length;
    return formatar(media * 0.5);
  };

  const calcularParcelasVencidas = (rmi, dib) => {
    if (!dib || typeof dib !== 'string') return { total: null, meses: 0 };

    const inicio = dayjs(dib, ['YYYY-MM-DD', 'DD/MM/YYYY']);
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
      meses
    };
  };

  const calcularParcelasVincendas = (rmi) => formatar(rmi * 13);

  const rmi = calcularRMI();
  const vencidasCalculadas = calcularParcelasVencidas(rmi, dib);
  const vincendas = calcularParcelasVincendas(rmi);
  const total = vencidasCalculadas.total !== null
    ? formatar(vencidasCalculadas.total + vincendas)
    : null;

  return {
    rmi,
    vencidas: vencidasCalculadas.total,
    vincendas,
    total,
    mesesVencidos: vencidasCalculadas.meses,
  };
};


const gerarTextoValorCausa = ({ rmi, vencidas, vincendas, total }) => {
  return `\n✅ RMI: R$ ${rmi.toFixed(2)}\n📆 Parcelas vencidas: R$ ${vencidas.toFixed(2)}\n📆 Parcelas vincendas (13 x RMI): R$ ${vincendas.toFixed(2)}\n💰 Valor total da causa: R$ ${total.toFixed(2)}\n`.trim();
};

module.exports = {
  calcularValorDaCausa,
  gerarTextoValorCausa
};
