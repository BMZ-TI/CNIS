function CalculoValorDaCausa({ result }) {
    if (!result) return null;
  
    return (
      <div className="item">
        <h3>Resultado do Cálculo</h3>
        <p><strong>DIB:</strong> {result.DIB}</p>
        <p><strong>RMI:</strong> R$ {result.RMI?.toFixed(2)}</p>
        <p><strong>Parcelas vencidas:</strong> R$ {result.parcelas_vencidas?.toFixed(2)}</p>
        <p><strong>13ºs:</strong> R$ {result.decimos_terceiros?.toFixed(2)}</p>
        <p><strong>Parcelas vincendas:</strong> R$ {result.vincendas?.toFixed(2)}</p>
        <p><strong>Total:</strong> <strong>R$ {result.total?.toFixed(2)}</strong></p>
      </div>
    );
  }
  
  export default CalculoValorDaCausa;
  