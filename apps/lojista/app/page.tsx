const products = [
  ["X-Burger", "R$ 18,00"],
  ["X-Bacon", "R$ 22,00"],
  ["Pizza Grande", "R$ 59,90"],
  ["Coca-Cola 2L", "R$ 10,00"]
];

const orders = [
  ["#1842", "Carlos", "R$ 72,90", "PIX pago"],
  ["#1841", "Ana", "R$ 46,50", "Dinheiro"],
  ["#1840", "Marcos", "R$ 88,20", "Cartão"]
];

export default function Home() {
  return (
    <main className="app">
      <aside className="side">
        <div className="logo"><span>CLICK</span>-FOOD</div>
        <p>Pizza Mais</p>
        <nav>{["Dashboard","Pedidos","PDV","Produtos","Estoque","Entregas","Clientes","Cupons","Financeiro","Bônus","Configurações"].map((x,i)=><button key={x} className={i===2?"active":""}>{x}</button>)}</nav>
      </aside>
      <section className="workspace">
        <header><div><small>LOJA ABERTA • CAIXA 01</small><h1>PDV</h1></div><div className="operator">Operador: Maria</div></header>
        <div className="kpis"><article><span>Vendas hoje</span><b>R$ 3.489,50</b></article><article><span>Pedidos</span><b>87</b></article><article><span>Ticket médio</span><b>R$ 40,10</b></article><article><span>Saldo</span><b>R$ 2.841,20</b></article></div>
        <div className="pos">
          <section className="catalog">
            <div className="search">Buscar produto ou código de barras</div>
            <div className="tabs"><button className="selected">Todos</button><button>Hambúrguer</button><button>Pizza</button><button>Bebidas</button></div>
            <div className="productGrid">{products.map(([name,price])=><button className="product" key={name}><span>{name}</span><strong>{price}</strong></button>)}</div>
            <article className="incoming"><div><small>NOVOS PEDIDOS</small><h2>Fila do delivery</h2></div><div className="orderRows">{orders.map(([id,name,total,payment])=><div key={id}><b>{id}</b><span>{name}</span><span>{payment}</span><strong>{total}</strong></div>)}</div></article>
          </section>
          <aside className="cart">
            <div className="cartHead"><div><small>PEDIDO ATUAL</small><h2>Balcão</h2></div><button>Limpar</button></div>
            <div className="item"><div><b>2× X-Burger</b><small>Sem cebola</small></div><strong>R$ 36,00</strong></div>
            <div className="item"><div><b>1× Coca-Cola 2L</b></div><strong>R$ 10,00</strong></div>
            <div className="totals"><div><span>Subtotal</span><b>R$ 46,00</b></div><div><span>Desconto</span><b>R$ 0,00</b></div><div className="grand"><span>Total</span><strong>R$ 46,00</strong></div></div>
            <button className="checkout">FINALIZAR VENDA</button>
            <div className="quick"><button>Salvar pedido</button><button>Adicionar cliente</button></div>
          </aside>
        </div>
      </section>
    </main>
  );
}
