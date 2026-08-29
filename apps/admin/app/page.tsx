const metrics = [
  ["GMV hoje", "R$ 154.890"],
  ["Receita CLICK-FOOD", "R$ 18.420"],
  ["Pedidos hoje", "4.582"],
  ["Lojas ativas", "186"],
  ["Entregadores online", "375"],
  ["Clientes ativos", "1.840"],
  ["Ticket médio", "R$ 33,80"],
  ["Inadimplentes", "12"]
];

const menu = ["Dashboard", "Pedidos", "Lojas", "Entregadores", "Clientes", "Cidades", "Planos", "Financeiro", "Bônus lojistas", "Suporte", "Auditoria"];

export default function Home() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span>CLICK</span>-FOOD</div>
        <p className="role">MATRIZ</p>
        <nav>{menu.map((item, index) => <button key={item} className={index === 0 ? "active" : ""}>{item}</button>)}</nav>
      </aside>
      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">Visão geral</p><h1>Dashboard</h1></div>
          <div className="status">Operação online</div>
        </header>
        <div className="metricGrid">
          {metrics.map(([label, value]) => <article className="metric" key={label}><p>{label}</p><strong>{value}</strong></article>)}
        </div>
        <div className="panels">
          <article className="panel wide">
            <div className="panelTitle"><h2>Pedidos e receita</h2><span>Últimos 7 dias</span></div>
            <div className="chartPlaceholder"><div className="bar b1"/><div className="bar b2"/><div className="bar b3"/><div className="bar b4"/><div className="bar b5"/><div className="bar b6"/><div className="bar b7"/></div>
          </article>
          <article className="panel">
            <div className="panelTitle"><h2>Atenção</h2></div>
            <ul className="alerts"><li>7 lojas inadimplentes</li><li>12 entregadores aguardando aprovação</li><li>3 pagamentos com falha</li><li>5 chamados críticos</li></ul>
          </article>
        </div>
        <article className="panel">
          <div className="panelTitle"><h2>Operação por cidade</h2><button className="primary">Ver mapa operacional</button></div>
          <div className="cityRows"><div><span>Uruaçu - GO</span><b>642 pedidos</b><em>28 entregadores online</em></div><div><span>Goiânia - GO</span><b>2.184 pedidos</b><em>142 entregadores online</em></div><div><span>Anápolis - GO</span><b>918 pedidos</b><em>61 entregadores online</em></div></div>
        </article>
      </section>
    </main>
  );
}
