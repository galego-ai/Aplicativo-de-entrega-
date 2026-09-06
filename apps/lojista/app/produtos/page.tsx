"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";

type StoreAccess = { id: string; name: string; role: string };
type Category = { id: string; name: string; active: boolean };
type Product = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  promotional_price: number | null;
  active: boolean;
  category_id: string | null;
  available_delivery: boolean;
  available_pos: boolean;
  control_inventory: boolean;
};
type ProductForm = {
  name: string;
  description: string;
  price: string;
  promotionalPrice: string;
  categoryId: string;
  availableDelivery: boolean;
  availablePos: boolean;
};

const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageBytes = 8 * 1024 * 1024;
const blankForm: ProductForm = {
  name: "",
  description: "",
  price: "",
  promotionalPrice: "",
  categoryId: "",
  availableDelivery: true,
  availablePos: true,
};

export default function ProdutosPage() {
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<StoreAccess | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionProductId, setActionProductId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [form, setForm] = useState<ProductForm>(blankForm);
  const [editing, setEditing] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<ProductForm>(blankForm);
  const editorRef = useRef<HTMLElement | null>(null);

  const canManage = store?.role === "OWNER" || store?.role === "MANAGER";
  const withImage = products.filter((product) => Boolean(product.image_url)).length;
  const deliveryCount = products.filter((product) => product.active && product.available_delivery).length;
  const posCount = products.filter((product) => product.active && product.available_pos).length;
  const selectedCategory = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  );

  async function load() {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setStore(null);
      setNotice("Entre no Painel Lojista primeiro.");
      setLoading(false);
      return;
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("store_memberships")
      .select("store_id,role,stores!inner(name)")
      .eq("user_id", sessionData.session.user.id)
      .eq("active", true)
      .limit(1);

    if (membershipError || !memberships?.length) {
      setStore(null);
      setNotice("Sua conta ainda não está vinculada a uma loja.");
      setLoading(false);
      return;
    }

    const row: any = memberships[0];
    const relation = Array.isArray(row.stores) ? row.stores[0] : row.stores;
    const access = {
      id: String(row.store_id),
      name: String(relation?.name ?? "Minha loja"),
      role: String(row.role),
    };
    setStore(access);

    const [productsResult, categoriesResult] = await Promise.all([
      supabase
        .from("products")
        .select("id,name,description,image_url,price,promotional_price,active,category_id,available_delivery,available_pos,control_inventory")
        .eq("store_id", access.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("categories")
        .select("id,name,active")
        .eq("store_id", access.id)
        .order("sort_order")
        .order("name"),
    ]);

    if (productsResult.error || categoriesResult.error) {
      setNotice("Não foi possível carregar o catálogo agora.");
      setLoading(false);
      return;
    }

    setProducts(
      (productsResult.data ?? []).map((product: any) => ({
        ...product,
        price: Number(product.price),
        promotional_price:
          product.promotional_price == null ? null : Number(product.promotional_price),
      })) as Product[],
    );
    setCategories((categoriesResult.data ?? []) as Category[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(
    () => () => {
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    },
    [imagePreview],
  );

  function validateProductForm(value: ProductForm) {
    const price = Number(value.price.replace(",", "."));
    const promotionalPrice = value.promotionalPrice.trim()
      ? Number(value.promotionalPrice.replace(",", "."))
      : null;
    if (!value.name.trim() || !Number.isFinite(price) || price <= 0) {
      return { error: "Informe o nome e um preço válido.", price: 0, promotionalPrice: null };
    }
    if (
      promotionalPrice != null &&
      (!Number.isFinite(promotionalPrice) || promotionalPrice <= 0 || promotionalPrice >= price)
    ) {
      return {
        error: "O preço promocional deve ser maior que zero e menor que o preço normal.",
        price,
        promotionalPrice: null,
      };
    }
    if (!value.availableDelivery && !value.availablePos) {
      return {
        error: "O produto precisa estar disponível no Delivery, no PDV ou nos dois.",
        price,
        promotionalPrice,
      };
    }
    return { error: "", price, promotionalPrice };
  }

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setImageFile(null);
      setImagePreview("");
      return;
    }
    if (!allowedTypes.has(file.type)) {
      setNotice("Use uma imagem JPG, PNG ou WEBP.");
      event.target.value = "";
      return;
    }
    if (file.size > maxImageBytes) {
      setNotice("A imagem deve ter no máximo 8 MB.");
      event.target.value = "";
      return;
    }
    if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setNotice("");
  }

  async function uploadProductImage(file: File) {
    if (!store) throw new Error("STORE_REQUIRED");
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${store.id}/products/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from("store-media").upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
    if (error) throw error;
    const url = supabase.storage.from("store-media").getPublicUrl(path).data.publicUrl;
    return { path, url };
  }

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    if (!store || !canManage || !categoryName.trim()) return;
    const { error } = await supabase.from("categories").insert({
      store_id: store.id,
      name: categoryName.trim(),
      active: true,
    });
    if (error) {
      setNotice("Não foi possível criar a categoria.");
      return;
    }
    setCategoryName("");
    setNotice("Categoria criada.");
    await load();
  }

  async function createProduct(event: FormEvent) {
    event.preventDefault();
    if (!store || !canManage) return;
    const parsed = validateProductForm(form);
    if (parsed.error) {
      setNotice(parsed.error);
      return;
    }
    if (form.availableDelivery && !imageFile) {
      setNotice("Adicione uma foto antes de publicar este produto no Delivery. Produtos visíveis ao cliente precisam de imagem.");
      return;
    }

    setSaving(true);
    setNotice("");
    let uploadedPath = "";
    try {
      let imageUrl: string | null = null;
      if (imageFile) {
        const uploaded = await uploadProductImage(imageFile);
        uploadedPath = uploaded.path;
        imageUrl = uploaded.url;
      }
      const { error } = await supabase.from("products").insert({
        store_id: store.id,
        category_id: form.categoryId || null,
        name: form.name.trim(),
        description: form.description.trim() || null,
        image_url: imageUrl,
        price: parsed.price,
        promotional_price: parsed.promotionalPrice,
        active: true,
        available_delivery: form.availableDelivery,
        available_pos: form.availablePos,
        control_inventory: false,
      });
      if (error) {
        if (uploadedPath) await supabase.storage.from("store-media").remove([uploadedPath]);
        throw error;
      }
      setForm(blankForm);
      setImageFile(null);
      if (imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
      setImagePreview("");
      setNotice(
        form.availableDelivery
          ? "Produto cadastrado com foto e publicado no Delivery."
          : "Produto cadastrado para os canais escolhidos.",
      );
      await load();
    } catch {
      setNotice("Não foi possível cadastrar o produto. Verifique os dados e tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(product: Product) {
    setEditing(product);
    setEditForm({
      name: product.name,
      description: product.description ?? "",
      price: String(product.price).replace(".", ","),
      promotionalPrice:
        product.promotional_price == null ? "" : String(product.promotional_price).replace(".", ","),
      categoryId: product.category_id ?? "",
      availableDelivery: product.available_delivery,
      availablePos: product.available_pos,
    });
    setNotice(`Editando: ${product.name}.`);
    requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!store || !editing || !canManage) return;
    const parsed = validateProductForm(editForm);
    if (parsed.error) {
      setNotice(parsed.error);
      return;
    }
    if (editForm.availableDelivery && !editing.image_url) {
      setNotice("Este produto ainda não tem foto. Adicione uma imagem antes de habilitá-lo no Delivery.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("products")
      .update({
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        price: parsed.price,
        promotional_price: parsed.promotionalPrice,
        category_id: editForm.categoryId || null,
        available_delivery: editForm.availableDelivery,
        available_pos: editForm.availablePos,
        updated_at: new Date().toISOString(),
      })
      .eq("id", editing.id)
      .eq("store_id", store.id);
    setSaving(false);

    if (error) {
      setNotice("Não foi possível salvar as alterações do produto.");
      return;
    }
    setNotice("Produto atualizado em todos os canais.");
    setEditing(null);
    await load();
  }

  async function toggleProduct(product: Product) {
    if (!store || !canManage || actionProductId) return;
    if (!product.active && product.available_delivery && !product.image_url) {
      setNotice("Adicione uma foto antes de ativar este produto no Delivery.");
      return;
    }

    setActionProductId(product.id);
    setNotice(product.active ? `Pausando ${product.name}...` : `Ativando ${product.name}...`);
    const { error } = await supabase
      .from("products")
      .update({ active: !product.active, updated_at: new Date().toISOString() })
      .eq("id", product.id)
      .eq("store_id", store.id);

    if (error) {
      setNotice("Não foi possível alterar a disponibilidade do produto.");
      setActionProductId(null);
      return;
    }

    if (editing?.id === product.id) setEditing(null);
    setNotice(
      product.active
        ? `${product.name} foi pausado e não aparecerá para novas vendas.`
        : `${product.name} foi ativado para vendas.`,
    );
    await load();
    setActionProductId(null);
  }

  async function replaceImage(product: Product, file: File | null) {
    if (!store || !canManage || !file) return;
    if (!allowedTypes.has(file.type) || file.size > maxImageBytes) {
      setNotice("Use JPG, PNG ou WEBP de até 8 MB.");
      return;
    }
    setNotice("Enviando nova foto...");
    try {
      const uploaded = await uploadProductImage(file);
      const { error } = await supabase
        .from("products")
        .update({ image_url: uploaded.url, updated_at: new Date().toISOString() })
        .eq("id", product.id)
        .eq("store_id", store.id);
      if (error) {
        await supabase.storage.from("store-media").remove([uploaded.path]);
        throw error;
      }
      setNotice("Foto do produto atualizada. O cliente verá a nova imagem no cardápio.");
      await load();
    } catch {
      setNotice("Não foi possível atualizar a foto do produto.");
    }
  }

  if (loading) {
    return <main className="productAdminPage"><div className="productAdminShell">Carregando produtos...</div></main>;
  }
  if (!store) {
    return (
      <main className="productAdminPage"><div className="productAdminShell">
        <h1>Produtos</h1><p>{notice}</p><a className="productBack" href="/">Voltar ao painel</a>
      </div></main>
    );
  }

  return (
    <main className="productAdminPage"><div className="productAdminShell">
      <header className="productHero">
        <div>
          <span className="productEyebrow">CATÁLOGO CLICK-FOOD</span>
          <h1>Produtos</h1>
          <p>{store.name} • fotos, preços, promoções e disponibilidade do Delivery/PDV em um só lugar.</p>
        </div>
        <div className="productHeroActions">
          <a className="productBack" href="/">← Painel</a>
          <a className="productBack" href="/estoque">Estoque</a>
          <a className="productBack" href="/catalogo-avancado">Adicionais</a>
          <button type="button" onClick={() => void load()}>Atualizar</button>
        </div>
      </header>

      {notice && <div className="productNotice">{notice}</div>}

      <section className="productStats">
        <article><span>Produtos</span><b>{products.length}</b></article>
        <article><span>Delivery ativos</span><b>{deliveryCount}</b></article>
        <article><span>PDV ativos</span><b>{posCount}</b></article>
        <article><span>Com foto</span><b>{withImage}/{products.length}</b></article>
      </section>

      {editing && (
        <section ref={editorRef} className="productCatalogCard productEditorCard" style={{ marginBottom: 16, border: "2px solid #e2bd00" }}>
          <div className="productSectionTitle">
            <div><span>EDITANDO PRODUTO</span><h2>{editing.name}</h2></div>
            <button type="button" onClick={() => setEditing(null)}>Fechar edição</button>
          </div>
          <form onSubmit={saveEdit} style={{ display: "grid", gap: 10 }}>
            <div className="productFormRow">
              <label>Nome<input value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></label>
              <label>Categoria<select value={editForm.categoryId} onChange={(event) => setEditForm({ ...editForm, categoryId: event.target.value })}>
                <option value="">Sem categoria</option>
                {categories.filter((category) => category.active || category.id === editing.category_id).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select></label>
            </div>
            <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
              Descrição<textarea style={{ minHeight: 80, border: "1px solid #dfe2e7", borderRadius: 12, padding: 11 }} value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} />
            </label>
            <div className="productFormRow">
              <label>Preço<input value={editForm.price} inputMode="decimal" onChange={(event) => setEditForm({ ...editForm, price: event.target.value })} /></label>
              <label>Preço promocional<input value={editForm.promotionalPrice} inputMode="decimal" onChange={(event) => setEditForm({ ...editForm, promotionalPrice: event.target.value })} /></label>
            </div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", padding: "8px 0" }}>
              <label><input type="checkbox" checked={editForm.availableDelivery} onChange={(event) => setEditForm({ ...editForm, availableDelivery: event.target.checked })} /> Disponível no Delivery</label>
              <label><input type="checkbox" checked={editForm.availablePos} onChange={(event) => setEditForm({ ...editForm, availablePos: event.target.checked })} /> Disponível no PDV</label>
            </div>
            {editForm.availableDelivery && !editing.image_url && <p className="productHint" style={{ color: "#9b2d24", fontWeight: 850 }}>Adicione uma foto pelo cartão do produto antes de publicar no Delivery.</p>}
            <button className="productPrimary" disabled={saving}>{saving ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}</button>
          </form>
        </section>
      )}

      <section className="productWorkspace" style={{ marginBottom: 16 }}>
        <form className="productFormCard" onSubmit={createProduct}>
          <div className="productSectionTitle"><div><span>NOVO PRODUTO</span><h2>Cadastro completo</h2></div></div>
          <div className="productPhotoDrop">
            {imagePreview ? <img src={imagePreview} alt="Prévia do produto" /> : <div><strong>📷</strong><b>Foto do produto</b><small>JPG, PNG ou WEBP • até 8 MB</small></div>}
            <label>Escolher imagem<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage} /></label>
          </div>
          <p className="productHint" style={{ marginTop: -4 }}>A foto é obrigatória para produtos publicados no app Delivery. Itens exclusivos do PDV podem ser cadastrados sem imagem.</p>
          <label>Nome do produto<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex.: X-Bacon" required /></label>
          <label>Descrição<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ingredientes, tamanho e detalhes que ajudam o cliente a escolher." /></label>
          <div className="productFormRow">
            <label>Categoria<select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
              <option value="">Sem categoria</option>
              {categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select></label>
            <label>Preço<input value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} inputMode="decimal" placeholder="0,00" required /></label>
          </div>
          <label>Preço promocional <small>(opcional)</small><input value={form.promotionalPrice} onChange={(event) => setForm({ ...form, promotionalPrice: event.target.value })} inputMode="decimal" placeholder="0,00" /></label>
          <div style={{ display: "grid", gap: 7, margin: "10px 0", fontSize: 12, fontWeight: 750 }}>
            <label><input type="checkbox" checked={form.availableDelivery} onChange={(event) => setForm({ ...form, availableDelivery: event.target.checked })} /> Vender no app Delivery</label>
            <label><input type="checkbox" checked={form.availablePos} onChange={(event) => setForm({ ...form, availablePos: event.target.checked })} /> Vender no PDV/balcão</label>
          </div>
          <button className="productPrimary" disabled={saving || !canManage}>{saving ? "SALVANDO..." : "CADASTRAR PRODUTO"}</button>
          {!canManage && <p className="productHint">Somente proprietário ou gerente pode cadastrar produtos.</p>}
        </form>

        <section className="productCatalogCard">
          <div className="productSectionTitle"><div><span>ORGANIZAÇÃO</span><h2>Categorias do cardápio</h2></div><b>{categories.length}</b></div>
          <form onSubmit={createCategory} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 14 }}>
            <input style={{ border: "1px solid #dfe2e7", borderRadius: 12, padding: "11px 12px" }} placeholder="Ex.: Hambúrgueres, Bebidas, Sobremesas" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
            <button className="productPrimary" style={{ margin: 0, width: "auto" }} disabled={!canManage}>CRIAR</button>
          </form>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {categories.map((category) => <span key={category.id} style={{ padding: "8px 10px", borderRadius: 999, background: category.active ? "#fff4b8" : "#eef0f3", fontSize: 11, fontWeight: 800 }}>{category.name}{!category.active ? " • pausada" : ""}</span>)}
            {!categories.length && <span className="productHint">Crie categorias para organizar melhor a experiência do cliente.</span>}
          </div>
          <div style={{ marginTop: 20, padding: 16, borderRadius: 15, background: "#f7f8fa" }}>
            <b>Fluxo recomendado</b>
            <p style={{ fontSize: 12, color: "#6f7580", lineHeight: 1.5 }}>1. Crie categorias. 2. Cadastre produtos com fotos. 3. Configure tamanhos e adicionais em <a href="/catalogo-avancado">Catálogo avançado</a>. 4. Se usar controle de saldo, configure em <a href="/estoque">Estoque</a>.</p>
          </div>
        </section>
      </section>

      <section className="productCatalogCard">
        <div className="productSectionTitle"><div><span>CATÁLOGO</span><h2>Produtos cadastrados</h2></div><b>{products.length}</b></div>
        <div className="productCards">
          {products.map((product) => (
            <article className="productCard" key={product.id}>
              <div className="productThumb">
                {product.image_url ? <img src={product.image_url} alt={product.name} /> : <div><span>🍽️</span><small>{product.available_delivery ? "FOTO OBRIGATÓRIA" : "Sem foto"}</small></div>}
                <span className={`productStatus ${product.active ? "isActive" : "isPaused"}`}>{product.active ? "ATIVO" : "PAUSADO"}</span>
              </div>
              <div className="productCardBody">
                <div><h3>{product.name}</h3><p>{product.description || "Sem descrição"}</p></div>
                <div className="productPrice">{product.promotional_price != null && <small>{brl(product.price)}</small>}<strong>{brl(product.promotional_price ?? product.price)}</strong></div>
                <div className="productMeta">
                  {product.category_id ? selectedCategory.get(product.category_id) ?? "Categoria" : "Sem categoria"} • {product.available_delivery ? "Delivery" : ""}{product.available_delivery && product.available_pos ? " + " : ""}{product.available_pos ? "PDV" : ""}{product.control_inventory ? " • Estoque controlado" : ""}
                </div>
                {product.available_delivery && !product.image_url && <div style={{ background: "#fff0ed", color: "#992f29", borderRadius: 10, padding: "8px 10px", fontSize: 11, fontWeight: 850 }}>Produto incompleto para Delivery: adicione uma foto.</div>}
                <div className="productCardActions">
                  <label className="productPhotoMini">📷 {product.image_url ? "Trocar foto" : "Adicionar foto"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void replaceImage(product, event.target.files?.[0] ?? null)} /></label>
                  <button type="button" className="productEdit" onClick={(event) => { event.preventDefault(); event.stopPropagation(); startEdit(product); }} disabled={!canManage || actionProductId === product.id}>✏️ Editar produto</button>
                  <button type="button" className="productPause" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void toggleProduct(product); }} disabled={!canManage || actionProductId === product.id}>{actionProductId === product.id ? "AGUARDE..." : product.active ? "⏸ Pausar venda" : "▶ Ativar venda"}</button>
                </div>
              </div>
            </article>
          ))}
          {!products.length && <div className="productEmpty">Nenhum produto cadastrado ainda.</div>}
        </div>
      </section>
    </div></main>
  );
}
