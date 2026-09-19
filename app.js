// --- ESTADO GLOBAL & PERSISTÊNCIA ---
let currentCategory = "todos";
let currentSubcategory = "todas";
let currentSort = "default";
let currentPriceRange = "all";
let searchQuery = "";
let showOnlyFavorites = false;
let currentQuickTag = null;

// Renderização incremental / Infinite scroll
let allFilteredProducts = [];
let renderedCount = 0;
const BATCH_SIZE = 28;
let scrollObserver = null;
let searchDebounceTimer = null;

// Recuperação segura do localStorage com fallback
let favorites = [];
try {
    favorites = JSON.parse(localStorage.getItem("agro_salinas_favs") || "[]");
    if (!Array.isArray(favorites)) favorites = [];
} catch (e) {
    favorites = [];
}

let cart = {};
try {
    cart = JSON.parse(localStorage.getItem("agro_salinas_cart") || "{}");
    if (typeof cart !== "object" || cart === null || Array.isArray(cart)) cart = {};
} catch (e) {
    cart = {};
}

let currentSeller = {
    code: STORE_CONFIG.defaultSeller.code,
    name: STORE_CONFIG.defaultSeller.name,
    tag: STORE_CONFIG.defaultSeller.tag
};

// Ícone SVG nítido e profissional de carrinho de supermercado
const CART_ICON_SVG = `<svg class="btn-svg-cart" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><circle cx="9" cy="21" r="1.2"></circle><circle cx="19" cy="21" r="1.2"></circle><path d="M1 1h4l2.6 12.8a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L23 6H6"></path></svg>`;

// Funções seguras de persistência
function saveCart() {
    try {
        localStorage.setItem("agro_salinas_cart", JSON.stringify(cart));
    } catch (e) {
        console.warn("Falha ao salvar carrinho no localStorage:", e);
    }
}

function saveFavorites() {
    try {
        localStorage.setItem("agro_salinas_favs", JSON.stringify(favorites));
    } catch (e) {
        console.warn("Falha ao salvar favoritos no localStorage:", e);
    }
}

// Catálogo mestre: exibe os produtos e controla itens disponíveis
function getCatalogProducts() {
    if (typeof STORE_CONFIG !== 'undefined' && STORE_CONFIG.hideWithoutImage) {
        return PRODUCTS.filter(p => !!p.image && typeof p.image === 'string' && p.image.trim() !== '');
    }
    return PRODUCTS;
}

// Verifica se o item pode ser escolhido/comprado no site
// Itens sem foto ficam com botão "Indisponível" (ativam sozinhos assim que adicionada a imagem)
function isProductAvailable(product) {
    if (!product) return false;
    if (typeof STORE_CONFIG !== 'undefined' && STORE_CONFIG.requireImageForPurchase) {
        return !!product.image && typeof product.image === 'string' && product.image.trim() !== '';
    }
    return true;
}

// Utilitário para conversão de ALL CAPS para Title Case (ex: Areia Sanitaria Pipicat Classic 4kg)
function toTitleCase(str) {
    if (!str) return "";
    const lowerWords = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "com", "por", "sem", "a", "o", "as", "os", "na", "no", "nas", "nos", "pra", "pro"]);
    const keepUpper = new Set(["NPK", "BHT", "DHA", "EPA", "PH", "AD", "BB", "SR", "UI", "IV", "SC", "IM"]);
    
    return str
        .toLowerCase()
        .replace(/([^\s\/\-\+\(\)]+)/g, (match, word, offset) => {
            const upper = word.toUpperCase();
            if (keepUpper.has(upper)) return upper;
            if (/^\d+(\.\d+)?(kg|g|mg|ml|l|cm|mm|un|pct)$/i.test(word)) {
                return word.toLowerCase();
            }
            const lower = word.toLowerCase();
            if (offset > 0 && lowerWords.has(lower)) {
                return lower;
            }
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        });
}

// Normalizador para buscas insensíveis a acentos e caixa alta/baixa
function normalizeText(str) {
    if (!str) return "";
    return str
        .toString()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

// --- INICIALIZAÇÃO ---
document.addEventListener("DOMContentLoaded", () => {
    initSeller();
    renderCategories();
    renderSubcategories();
    renderProducts();
    setupEventListeners();
    updateCartUI();
    updateFavoritesUI();
});

// --- SISTEMA MULTI-VENDEDOR SEGURO (PROTEÇÃO DE COMISSÃO) ---
function initSeller() {
    const urlParams = new URLSearchParams(window.location.search);
    const sellerParam = urlParams.get("v") || urlParams.get("vendedor") || urlParams.get("ref");

    // Vendedor padrão caso não haja indicação (Grégory)
    const fallbackSeller = (typeof VENDAS_CONFIG !== 'undefined' && VENDAS_CONFIG.defaultVendedor) 
        ? VENDAS_CONFIG.defaultVendedor 
        : { code: "GREG", name: "Grégory", whatsapp: "5551982199486" };

    if (sellerParam) {
        const inputCode = decodeURIComponent(sellerParam).trim().toUpperCase();
        
        // Valida se o vendedor existe no cadastro oficial
        let matched = null;
        if (typeof findVendedorByCode === 'function') {
            matched = findVendedorByCode(inputCode);
        } else if (typeof VENDEDORES !== 'undefined') {
            matched = VENDEDORES.find(v => v.code === inputCode && v.active);
        }

        if (matched) {
            currentSeller = {
                code: matched.code,
                name: matched.name,
                tag: `#${matched.code}`,
                whatsapp: matched.whatsapp
            };
            // Salva na sessão do cliente para ele não perder o vendedor enquanto navega
            localStorage.setItem("agro_salinas_seller_code", matched.code);
        } else {
            // Código desconhecido: usa padrão
            currentSeller = {
                code: fallbackSeller.code,
                name: fallbackSeller.name,
                tag: `#${fallbackSeller.code}`,
                whatsapp: fallbackSeller.whatsapp
            };
        }
    } else {
        // Se não veio parâmetro na URL, verifica se o cliente já tinha vendedor salvo
        const savedCode = localStorage.getItem("agro_salinas_seller_code");
        let matched = null;
        if (savedCode) {
            if (typeof findVendedorByCode === 'function') {
                matched = findVendedorByCode(savedCode);
            } else if (typeof VENDEDORES !== 'undefined') {
                matched = VENDEDORES.find(v => v.code === savedCode && v.active);
            }
        }

        if (matched) {
            currentSeller = {
                code: matched.code,
                name: matched.name,
                tag: `#${matched.code}`,
                whatsapp: matched.whatsapp
            };
        } else {
            currentSeller = {
                code: fallbackSeller.code,
                name: fallbackSeller.name,
                tag: `#${fallbackSeller.code}`,
                whatsapp: fallbackSeller.whatsapp
            };
        }
    }

    // Atualizar UI do Banner (se visível)
    const bannerEl = document.getElementById("seller-banner");
    const sellerNameEl = document.getElementById("seller-name");
    const sellerTagEl = document.getElementById("seller-tag");
    if (sellerNameEl) sellerNameEl.textContent = currentSeller.name;
    if (sellerTagEl) sellerTagEl.textContent = currentSeller.tag;
    
    // Se o cliente acessou por link de vendedor oficial, mostramos uma identificação elegante e discreta
    if (bannerEl && currentSeller.code) {
        bannerEl.style.display = "flex";
    }
}

// --- RENDERIZAÇÃO DAS CATEGORIAS PRINCIPAIS (DESKTOP & SIDEBAR) ---
function renderCategories() {
    const desktopContainer = document.getElementById("categories-list");
    const sidebarContainer = document.getElementById("sidebar-categories-list");

    // HTML Desktop (Pills horizontais em fileira única)
    if (desktopContainer) {
        desktopContainer.innerHTML = CATEGORIES.map(cat => `
            <button class="category-pill ${cat.id === currentCategory ? 'active' : ''}" data-cat="${cat.id}">
                <span>${cat.icon}</span>
                <span>${cat.name}</span>
            </button>
        `).join("");

        desktopContainer.querySelectorAll(".category-pill").forEach(btn => {
            btn.addEventListener("click", () => {
                selectCategory(btn.getAttribute("data-cat"));
            });
        });
    }

    // HTML Sidebar Drawer (Itens verticais completos com contagem de produtos)
    if (sidebarContainer) {
        const activeList = getCatalogProducts();
        sidebarContainer.innerHTML = CATEGORIES.map(cat => {
            const count = cat.id === 'todos' 
                ? activeList.length 
                : activeList.filter(p => p.category === cat.id).length;

            return `
                <button class="sidebar-cat-btn ${cat.id === currentCategory ? 'active' : ''}" data-cat="${cat.id}">
                    <div class="cat-left">
                        <span class="cat-icon">${cat.icon}</span>
                        <span>${cat.name}</span>
                    </div>
                    <span class="cat-count">${count}</span>
                </button>
            `;
        }).join("");

        sidebarContainer.querySelectorAll(".sidebar-cat-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                selectCategory(btn.getAttribute("data-cat"));
                // Se escolheu 'todos', fecha o drawer para conveniência
                if (btn.getAttribute("data-cat") === 'todos') {
                    closeSidebarDrawer();
                }
            });
        });
    }
}

// Handler unificado de seleção de categoria
function selectCategory(catId) {
    currentCategory = catId;
    currentSubcategory = "todas"; // Resetar subcategoria ao trocar de categoria principal

    // Sincronizar classes ativas
    document.querySelectorAll(".category-pill").forEach(p => {
        p.classList.toggle("active", p.getAttribute("data-cat") === catId);
    });
    document.querySelectorAll(".sidebar-cat-btn").forEach(p => {
        p.classList.toggle("active", p.getAttribute("data-cat") === catId);
    });

    renderSubcategories();
    renderProducts();
}

// --- RENDERIZAÇÃO DAS SUBCATEGORIAS DINÂMICAS (DESKTOP & SIDEBAR) ---
function renderSubcategories() {
    const desktopWrapper = document.getElementById("subcategories-wrapper");
    const desktopList = document.getElementById("subcategories-list");
    const sidebarSection = document.getElementById("sidebar-subcategories-section");
    const sidebarList = document.getElementById("sidebar-subcategories-list");
    const sidebarTitle = document.getElementById("sidebar-subcategories-title");

    if (currentCategory === "todos") {
        if (desktopWrapper) desktopWrapper.style.display = "none";
        if (desktopList) desktopList.innerHTML = "";
        if (sidebarSection) sidebarSection.style.display = "none";
        if (sidebarList) sidebarList.innerHTML = "";
        return;
    }

    // Obter todas as subcategorias únicas desta categoria com base nos produtos ativos
    const activeProducts = getCatalogProducts();
    const categoryProducts = activeProducts.filter(p => {
        if (p.category !== currentCategory) return false;
        if (currentCategory === "granel" && (!p.image || !p.image.startsWith("assets/granel/"))) return false;
        return true;
    });
    const subcats = Array.from(new Set(categoryProducts.map(p => p.subcategory).filter(Boolean)));
    const catObj = CATEGORIES.find(c => c.id === currentCategory);
    const catShortName = catObj ? catObj.name.split(' ')[0] : 'Categoria';

    if (subcats.length <= 1) {
        if (desktopWrapper) desktopWrapper.style.display = "none";
        if (desktopList) desktopList.innerHTML = "";
        if (sidebarSection) sidebarSection.style.display = "none";
        if (sidebarList) sidebarList.innerHTML = "";
        return;
    }

    // Atualizar no Desktop
    if (desktopWrapper && desktopList) {
        desktopWrapper.style.display = "block";
        let desktopHtml = `
            <button class="subcat-pill ${currentSubcategory === 'todas' ? 'active' : ''}" data-subcat="todas">
                Tudo em ${catShortName}
            </button>
        `;
        subcats.forEach(sub => {
            desktopHtml += `
                <button class="subcat-pill ${currentSubcategory === sub ? 'active' : ''}" data-subcat="${sub}">
                    ${sub}
                </button>
            `;
        });
        desktopList.innerHTML = desktopHtml;
        desktopList.querySelectorAll(".subcat-pill").forEach(btn => {
            btn.addEventListener("click", () => {
                selectSubcategory(btn.getAttribute("data-subcat"));
            });
        });
    }

    // Atualizar no Sidebar Drawer
    if (sidebarSection && sidebarList) {
        sidebarSection.style.display = "flex";
        if (sidebarTitle) sidebarTitle.textContent = `Subcategorias em ${catShortName}`;

        let sidebarHtml = `
            <button class="sidebar-subcat-btn ${currentSubcategory === 'todas' ? 'active' : ''}" data-subcat="todas">
                <span>✓ Todas as subcategorias</span>
                <span style="font-size: 11px; opacity: 0.7;">(${categoryProducts.length})</span>
            </button>
        `;
        subcats.forEach(sub => {
            const subCount = categoryProducts.filter(p => p.subcategory === sub).length;
            sidebarHtml += `
                <button class="sidebar-subcat-btn ${currentSubcategory === sub ? 'active' : ''}" data-subcat="${sub}">
                    <span>${sub}</span>
                    <span style="font-size: 11px; opacity: 0.7;">(${subCount})</span>
                </button>
            `;
        });
        sidebarList.innerHTML = sidebarHtml;
        sidebarList.querySelectorAll(".sidebar-subcat-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                selectSubcategory(btn.getAttribute("data-subcat"));
                closeSidebarDrawer();
            });
        });
    }
}

// Handler unificado de seleção de subcategoria
function selectSubcategory(subcatName) {
    currentSubcategory = subcatName;

    // Sincronizar classes ativas
    document.querySelectorAll(".subcat-pill").forEach(p => {
        p.classList.toggle("active", p.getAttribute("data-subcat") === subcatName);
    });
    document.querySelectorAll(".sidebar-subcat-btn").forEach(p => {
        p.classList.toggle("active", p.getAttribute("data-subcat") === subcatName);
    });

    renderProducts();
}

// --- ÍCONE POR CATEGORIA ---
function getCategoryIcon(catId) {
    const icons = {
        caes: "🐶",
        gatos: "🐱",
        granel: "⚖️",
        farmacia: "💊",
        passaros_roedores: "🦜",
        jardim_agro: "🌿",
        pesca: "🎣"
    };
    return icons[catId] || "🌾";
}

// --- CONSTRUÇÃO DO CARD DO PRODUTO (LAYOUT LIMPO, TITLE CASE, SVG FALLBACK) ---
function buildProductCardHtml(product) {
    const qtyInCart = cart[product.id] || 0;
    const isFav = favorites.includes(product.id.toString());
    const catName = CATEGORIES.find(c => c.id === product.category)?.name.split(' ')[0] || 'Agro';
    const isGranel = product.category === 'granel';
    const productName = toTitleCase(product.name);

    // Placeholder Vetorial Minimalista e Limpo (sem emojis infantis gigantes)
    const placeholderSvg = `
        <div class="product-placeholder-box">
            <svg class="placeholder-svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 12 L44 12 L48 22 L48 54 C48 56.2 46.2 58 44 58 L20 58 C17.8 58 16 56.2 16 54 L16 22 Z" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M20 12 L24 8 L40 8 L44 12" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M16 22 L48 22" stroke-width="2" stroke-linecap="round"/>
                <circle cx="32" cy="38" r="8" stroke-width="2" opacity="0.35"/>
                <path d="M29 38 L35 38 M32 35 L32 41" stroke-width="1.8" stroke-linecap="round" opacity="0.45"/>
            </svg>
            <span class="product-placeholder-tag">${catName}</span>
        </div>
    `;

    const imageHtml = product.image ? `
        <div class="product-image-container" onclick="openQuickView('${product.id}')" title="Clique para ver detalhes rápidos do produto">
            <img src="${product.image}" alt="${productName}" class="product-img" loading="lazy" decoding="async" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'product-placeholder-box\\'><svg class=\\'placeholder-svg\\' viewBox=\\'0 0 64 64\\' fill=\\'none\\' stroke=\\'currentColor\\' xmlns=\\'http://www.w3.org/2000/svg\\'><path d=\\'M20 12 L44 12 L48 22 L48 54 C48 56.2 46.2 58 44 58 L20 58 C17.8 58 16 56.2 16 54 L16 22 Z\\' stroke-width=\\'2.2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'/><path d=\\'M20 12 L24 8 L40 8 L44 12\\' stroke-width=\\'2.2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'/><path d=\\'M16 22 L48 22\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\'/><circle cx=\\'32\\' cy=\\'38\\' r=\\'8\\' stroke-width=\\'2\\' opacity=\\'0.35\\'/></svg><span class=\\'product-placeholder-tag\\'>${catName}</span></div>';">
        </div>
    ` : `
        <div class="product-image-container" onclick="openQuickView('${product.id}')" title="Clique para ver detalhes rápidos do produto">
            ${placeholderSvg}
        </div>
    `;

    const isAvailable = isProductAvailable(product);
    let badgeHtml = '';
    if (!isAvailable) {
        badgeHtml = `<span class="product-badge badge-unavailable">🚫 Indisponível</span>`;
    } else if (product.badge) {
        badgeHtml = `<span class="product-badge ${isGranel ? 'badge-granel' : ''}">${isGranel ? '⚖️ ' + product.badge : product.badge}</span>`;
    }

    return `
        <div class="product-card ${isGranel ? 'product-card-granel' : ''} ${!isAvailable ? 'card-unavailable' : ''}" id="card-${product.id}">
            <div class="card-top-actions">
                <button class="btn-fav-card ${isFav ? 'active' : ''}" onclick="toggleFavorite('${product.id}', event)" title="${isFav ? 'Remover dos favoritos' : 'Favoritar produto'}" aria-label="Favoritar">
                    ${isFav ? '🧡' : '🤍'}
                </button>
                <button class="btn-zap-card" onclick="quickBuyWhatsApp('${product.id}')" title="Tirar dúvidas ou pedir este item no WhatsApp" aria-label="Pedir no WhatsApp">
                    <span>💬</span>
                </button>
            </div>
            ${badgeHtml}
            ${imageHtml}
            <div class="card-info-wrap">
                <div class="product-meta-line">
                    <span class="meta-code">Cód: ${product.code}</span>
                    <span class="meta-sep">•</span>
                    <span class="meta-cat">${product.subcategory || catName}</span>
                </div>
                <h3 class="product-name" onclick="openQuickView('${product.id}')" title="Clique para ver detalhes rápidos do produto">${productName}</h3>
            </div>
            
            <div class="product-footer">
                ${isGranel ? (() => {
                    const pkgWeight = product.badge ? product.badge.replace(/^Pacote\s+/i, '') : (product.unit || 'Kg');
                    const matchKg = product.extraInfo ? product.extraInfo.match(/R\$\s*[\d,.]+\/kg/i) : null;
                    const kgRate = matchKg ? matchKg[0] : (product.extraInfo ? product.extraInfo.replace(/.*?\(/, '').replace(')', '') : '');
                    const subText = `Pacote ${pkgWeight}${kgRate ? ' • ' + kgRate : ''}`;
                    return `
                        <div class="granel-compact-price">
                            <div class="granel-main-price">R$ ${product.price.toFixed(2).replace('.', ',')}</div>
                            <div class="granel-sub-text">${subText}</div>
                        </div>
                    `;
                })() : `
                    <div class="price-row">
                        <div>
                            <span class="price-label">PREÇO</span>
                            <div class="price-value">R$ ${product.price.toFixed(2).replace('.', ',')}</div>
                        </div>
                        <span class="price-unit">/${product.unit || 'un'}</span>
                    </div>
                `}

                <div class="card-actions">
                    ${!isAvailable ? `
                        <button class="btn-add-cart btn-unavailable" id="btn-add-${product.id}" disabled title="Item indisponível para pedidos no momento">
                            <span class="btn-cart-icon">🚫</span>
                            <span class="btn-cart-text">Indisponível</span>
                        </button>
                    ` : qtyInCart > 0 ? `
                        <div class="card-qty-selector ${isGranel ? 'granel-qty-selector' : ''}" id="qty-selector-${product.id}">
                            <button class="card-qty-btn minus" onclick="updateCartQty('${product.id}', -1, event)" title="Diminuir quantidade" aria-label="Diminuir quantidade">−</button>
                            <span class="card-qty-display">
                                <span class="card-qty-val">${qtyInCart}</span>
                                <span class="card-qty-label">${isGranel ? 'no carrinho' : 'no carrinho'}</span>
                            </span>
                            <button class="card-qty-btn plus" onclick="updateCartQty('${product.id}', 1, event)" title="Aumentar quantidade" aria-label="Aumentar quantidade">+</button>
                        </div>
                    ` : `
                        <button class="btn-add-cart ${isGranel ? 'btn-add-cart-granel' : ''}" id="btn-add-${product.id}" onclick="addToCart('${product.id}', event)">
                            <span class="btn-cart-icon">${CART_ICON_SVG}</span>
                            <span class="btn-cart-text">Adicionar</span>
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

// --- RENDERIZAÇÃO PROGRESSIVA & INCREMENTAL DOS PRODUTOS (PERFORMANCE MÁXIMA) ---
function renderProducts() {
    const grid = document.getElementById("products-grid");
    const countEl = document.getElementById("products-count");
    const titleEl = document.getElementById("section-title");
    const clearBtn = document.getElementById("btn-clear-filters");
    if (!grid) return;

    // Atualizar Título da Seção
    if (titleEl) {
        if (showOnlyFavorites) {
            titleEl.textContent = "🧡 Meus Produtos Favoritos";
        } else if (currentQuickTag) {
            const tagLabels = {
                mais_vendidos: "🔥 Produtos Mais Vendidos",
                filhotes: "🍼 Especial Para Filhotes",
                castrados: "✂️ Rações Para Pets Castrados",
                sensivel: "🌾 Hipoalergênico & Pele Sensível",
                porte_pequeno: "🐾 Para Raças Pequenas & Mini",
                senior: "👴 Cuidados Sênior (+7 anos)"
            };
            titleEl.textContent = tagLabels[currentQuickTag] || "Filtro Rápido";
        } else {
            const catObj = CATEGORIES.find(c => c.id === currentCategory);
            if (currentSubcategory !== "todas") {
                titleEl.textContent = `${catObj ? catObj.name : ''} > ${currentSubcategory}`;
            } else if (currentCategory !== "todos") {
                titleEl.textContent = `${catObj ? catObj.icon + ' ' + catObj.name : 'Produtos'}`;
            } else if (searchQuery) {
                titleEl.textContent = `Resultados para: "${searchQuery}"`;
            } else {
                titleEl.textContent = "Todos os Produtos";
            }
        }
    }

    const normQuery = normalizeText(searchQuery);
    const queryTokens = normQuery ? normQuery.split(/\s+/).filter(Boolean) : [];

    // Filtragem com normalização sem acentos e busca unificada por nome, código e subcategoria
    const baseProducts = getCatalogProducts();
    allFilteredProducts = baseProducts.filter(p => {
        // Filtro de Favoritos
        if (showOnlyFavorites && !favorites.includes(p.id.toString())) {
            return false;
        }

        // Filtro Rápido por Necessidade do Pet
        if (currentQuickTag) {
            const fullText = normalizeText(p.name + " " + (p.subcategory || "") + " " + (p.badge || ""));
            if (currentQuickTag === "mais_vendidos") {
                if (!p.featured && p.price < 50 && !p.id.toString().startsWith("granel")) return false;
            } else if (currentQuickTag === "filhotes") {
                if (!fullText.includes("filhote") && !fullText.includes("puppy") && !fullText.includes("junior")) return false;
            } else if (currentQuickTag === "castrados") {
                if (!fullText.includes("castrad")) return false;
            } else if (currentQuickTag === "sensivel") {
                if (!fullText.includes("sensiv") && !fullText.includes("hipo") && !fullText.includes("derme") && !fullText.includes("pele")) return false;
            } else if (currentQuickTag === "porte_pequeno") {
                if (!fullText.includes("pequen") && !fullText.includes("mini") && !fullText.includes("small")) return false;
            } else if (currentQuickTag === "senior") {
                if (!fullText.includes("senior") && !fullText.includes("idade") && !fullText.includes("+7") && !fullText.includes("maduro")) return false;
            }
        }

        // Categoria Principal
        if (currentCategory !== "todos" && p.category !== currentCategory) {
            return false;
        }

        // No menu de Rações a Granel, exibir exclusivamente os itens com imagem desta pasta
        if (currentCategory === "granel" && (!p.image || !p.image.startsWith("assets/granel/"))) {
            return false;
        }
        
        // Subcategoria
        if (currentSubcategory !== "todas" && p.subcategory !== currentSubcategory) {
            return false;
        }
        
        // Faixa de Preço
        if (currentPriceRange === "under_20" && p.price > 20) return false;
        if (currentPriceRange === "20_60" && (p.price <= 20 || p.price > 60)) return false;
        if (currentPriceRange === "60_150" && (p.price <= 60 || p.price > 150)) return false;
        if (currentPriceRange === "above_150" && p.price <= 150) return false;

        // Busca textual inteligente (ignora acentos, maiúsculas/minúsculas, pesquisa por nome ou código)
        if (queryTokens.length > 0) {
            const normName = normalizeText(p.name);
            const normCode = normalizeText(p.code);
            const normSubcat = normalizeText(p.subcategory);
            const combined = `${normName} ${normCode} ${normSubcat}`;
            const matchesAllTokens = queryTokens.every(tok => combined.includes(tok));
            if (!matchesAllTokens) return false;
        }

        return true;
    });

    // Ordenação: Produtos disponíveis com imagem sempre primeiro, itens sem imagem/indisponíveis abaixo
    allFilteredProducts.sort((a, b) => {
        const aAvail = isProductAvailable(a);
        const bAvail = isProductAvailable(b);
        if (aAvail && !bAvail) return -1;
        if (!aAvail && bAvail) return 1;

        if (currentSort === "price_asc") {
            return a.price - b.price;
        } else if (currentSort === "price_desc") {
            return b.price - a.price;
        } else if (currentSort === "name_asc") {
            return a.name.localeCompare(b.name, 'pt-BR');
        } else {
            // default: Destaques primeiro, depois alfabético
            if (a.featured && !b.featured) return -1;
            if (!a.featured && b.featured) return 1;
            return a.name.localeCompare(b.name, 'pt-BR');
        }
    });

    // Botão Limpar Filtros e Indicador Ativo
    const isFiltered = currentCategory !== "todos" || currentSubcategory !== "todas" || searchQuery !== "" || currentPriceRange !== "all" || currentSort !== "default" || showOnlyFavorites || currentQuickTag !== null;
    if (clearBtn) {
        clearBtn.style.display = isFiltered ? "inline-block" : "none";
    }

    const activeDot = document.getElementById("sidebar-active-dot");
    if (activeDot) {
        activeDot.style.display = isFiltered ? "block" : "none";
    }
    const sidebarClearBox = document.getElementById("sidebar-clear-box");
    if (sidebarClearBox) {
        sidebarClearBox.style.display = isFiltered ? "block" : "none";
    }

    // Atualiza a barra evidente de filtros no topo da listagem (Desktop e Mobile)
    updateActiveFiltersBar(isFiltered);

    // Contador
    if (countEl) {
        countEl.textContent = `${allFilteredProducts.length} produto${allFilteredProducts.length === 1 ? '' : 's'}`;
    }

    // Estado Vazio
    if (allFilteredProducts.length === 0) {
        if (scrollObserver) scrollObserver.disconnect();
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 50px 20px; background: white; border-radius: 14px; border: 1px dashed var(--border-color); box-shadow: var(--shadow-sm);">
                <p style="font-size: 36px; margin-bottom: 8px;">${showOnlyFavorites ? '🧡' : '🔍'}</p>
                <h3 style="color: var(--primary-dark); margin-bottom: 6px;">${showOnlyFavorites ? 'Nenhum favorito salvo ainda' : 'Nenhum produto encontrado'}</h3>
                <p style="font-size: 13.5px; color: var(--text-muted); margin-bottom: 16px;">${showOnlyFavorites ? 'Clique no coração dos produtos para salvá-los aqui!' : 'Tente ajustar sua busca ou limpar os filtros aplicados.'}</p>
                <button onclick="resetAllFilters()" style="background: var(--primary); color: white; border: none; padding: 10px 20px; border-radius: 20px; font-weight: 700; cursor: pointer;">
                    Ver Todos os Produtos ⚡
                </button>
            </div>
        `;
        return;
    }

    // Limpa o grid, reseta o contador e renderiza o primeiro lote
    grid.innerHTML = "";
    renderedCount = 0;
    renderNextBatch();
    setupScrollObserver();
}

// Renderização incremental em lotes de 28 produtos via Virtual Scroll / Observer
function renderNextBatch() {
    const grid = document.getElementById("products-grid");
    if (!grid || renderedCount >= allFilteredProducts.length) return;

    // Remove sentinela anterior antes de injetar novo lote
    const oldSentinel = document.getElementById("scroll-sentinel");
    if (oldSentinel) oldSentinel.remove();

    const nextBatch = allFilteredProducts.slice(renderedCount, renderedCount + BATCH_SIZE);
    const htmlChunk = nextBatch.map(p => buildProductCardHtml(p)).join("");
    grid.insertAdjacentHTML("beforeend", htmlChunk);
    renderedCount += nextBatch.length;

    // Se ainda restarem itens a carregar, injeta sentinela e observa
    if (renderedCount < allFilteredProducts.length) {
        const sentinel = document.createElement("div");
        sentinel.id = "scroll-sentinel";
        sentinel.className = "scroll-sentinel";
        sentinel.innerHTML = `
            <div class="sentinel-loader">
                <span class="loader-dot"></span>
                <span class="loader-dot"></span>
                <span class="loader-dot"></span>
            </div>
        `;
        grid.appendChild(sentinel);
        if (scrollObserver) {
            scrollObserver.observe(sentinel);
        }
    }
}

// Configuração do IntersectionObserver para scroll suave
function setupScrollObserver() {
    if (scrollObserver) {
        scrollObserver.disconnect();
    }
    const sentinel = document.getElementById("scroll-sentinel");
    if (!sentinel) return;

    scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && renderedCount < allFilteredProducts.length) {
                renderNextBatch();
            }
        });
    }, {
        root: null,
        rootMargin: "350px",
        threshold: 0.05
    });

    scrollObserver.observe(sentinel);
}

// --- BARRA EVIDENTE DE FILTROS ATIVOS (REDEFINIÇÃO EM 1 CLIQUE) ---
function updateActiveFiltersBar(isFiltered) {
    const bar = document.getElementById("active-filters-bar");
    const chipsContainer = document.getElementById("active-filters-chips");
    if (!bar || !chipsContainer) return;

    if (!isFiltered) {
        bar.style.display = "none";
        chipsContainer.innerHTML = "";
        return;
    }

    let chipsHtml = "";

    // Categoria
    if (currentCategory !== "todos") {
        const cat = CATEGORIES.find(c => c.id === currentCategory);
        const catName = cat ? `${cat.icon} ${cat.name}` : currentCategory;
        chipsHtml += `
            <div class="active-filter-chip" onclick="selectCategory('todos')" title="Remover filtro de categoria">
                <span>${catName}</span>
                <span class="active-filter-chip-remove">✕</span>
            </div>
        `;
    }

    // Subcategoria
    if (currentSubcategory !== "todas") {
        chipsHtml += `
            <div class="active-filter-chip" onclick="selectSubcategory('todas')" title="Remover filtro de subcategoria">
                <span>🏷️ ${currentSubcategory}</span>
                <span class="active-filter-chip-remove">✕</span>
            </div>
        `;
    }

    // Filtro Rápido (Necessidade do Pet)
    if (currentQuickTag) {
        const tagLabels = {
            mais_vendidos: "🔥 Mais Vendidos",
            filhotes: "🍼 Filhotes",
            castrados: "✂️ Castrados",
            sensivel: "🌾 Sensíveis",
            porte_pequeno: "🐾 Raças Pequenas",
            senior: "👴 Sênior (+7)"
        };
        chipsHtml += `
            <div class="active-filter-chip" onclick="toggleQuickTag('${currentQuickTag}', null)" title="Remover filtro rápido">
                <span>${tagLabels[currentQuickTag] || currentQuickTag}</span>
                <span class="active-filter-chip-remove">✕</span>
            </div>
        `;
    }

    // Faixa de Preço
    if (currentPriceRange !== "all") {
        const priceLabels = {
            under_20: "Até R$ 20",
            "20_60": "R$ 20 a R$ 60",
            "60_150": "R$ 60 a R$ 150",
            above_150: "Acima de R$ 150"
        };
        chipsHtml += `
            <div class="active-filter-chip" onclick="resetPriceFilter()" title="Remover filtro de valor">
                <span>💰 ${priceLabels[currentPriceRange] || currentPriceRange}</span>
                <span class="active-filter-chip-remove">✕</span>
            </div>
        `;
    }

    // Busca textual
    if (searchQuery.trim() !== "") {
        chipsHtml += `
            <div class="active-filter-chip" onclick="clearSearchQuery()" title="Limpar busca">
                <span>🔍 "${searchQuery}"</span>
                <span class="active-filter-chip-remove">✕</span>
            </div>
        `;
    }

    // Favoritos
    if (showOnlyFavorites) {
        chipsHtml += `
            <div class="active-filter-chip" onclick="toggleFavoritesFilter()" title="Remover filtro de favoritos">
                <span>🧡 Apenas Favoritos</span>
                <span class="active-filter-chip-remove">✕</span>
            </div>
        `;
    }

    chipsContainer.innerHTML = chipsHtml;
    bar.style.display = "flex";
}

function resetPriceFilter() {
    currentPriceRange = "all";
    const select = document.getElementById("price-range-select");
    if (select) select.value = "all";
    const sidebarSelect = document.getElementById("sidebar-price-select");
    if (sidebarSelect) sidebarSelect.value = "all";
    renderProducts();
}

function clearSearchQuery() {
    searchQuery = "";
    const input = document.getElementById("search-input");
    if (input) input.value = "";
    renderProducts();
}

// Atualização pontual do botão de um card sem re-renderizar todo o catálogo
function updateCardActionUI(productId) {
    const card = document.getElementById(`card-${productId}`);
    if (!card) return;
    const product = PRODUCTS.find(p => p.id.toString() === productId.toString());
    if (!product) return;
    const actionsContainer = card.querySelector('.card-actions');
    if (!actionsContainer) return;

    if (!isProductAvailable(product)) {
        actionsContainer.innerHTML = `
            <button class="btn-add-cart btn-unavailable" id="btn-add-${product.id}" disabled title="Item indisponível para pedidos no momento">
                <span class="btn-cart-icon">🚫</span>
                <span class="btn-cart-text">Indisponível</span>
            </button>
        `;
        return;
    }

    const qtyInCart = cart[productId] || 0;
    const isGranel = product.category === 'granel';

    if (qtyInCart > 0) {
        actionsContainer.innerHTML = `
            <div class="card-qty-selector ${isGranel ? 'granel-qty-selector' : ''}" id="qty-selector-${product.id}">
                <button class="card-qty-btn minus" onclick="updateCartQty('${product.id}', -1, event)" title="Diminuir quantidade" aria-label="Diminuir quantidade">−</button>
                <span class="card-qty-display">
                    <span class="card-qty-val">${qtyInCart}</span>
                    <span class="card-qty-label">${isGranel ? 'pct no carrinho' : 'no carrinho'}</span>
                </span>
                <button class="card-qty-btn plus" onclick="updateCartQty('${product.id}', 1, event)" title="Aumentar quantidade" aria-label="Aumentar quantidade">+</button>
            </div>
        `;
    } else {
        actionsContainer.innerHTML = `
            <button class="btn-add-cart ${isGranel ? 'btn-add-cart-granel' : ''}" id="btn-add-${product.id}" onclick="addToCart('${product.id}', event)">
                <span class="btn-cart-icon">${CART_ICON_SVG}</span>
                <span class="btn-cart-text">${isGranel ? 'Adicionar Pacote ao Carrinho' : 'Adicionar ao Carrinho'}</span>
            </button>
        `;
    }
}

// --- CONTROLE DE CARRINHO & PERSISTÊNCIA ---
function addToCart(productId, event) {
    if (event) event.stopPropagation();
    const product = PRODUCTS.find(p => p.id.toString() === productId.toString());
    if (product && !isProductAvailable(product)) {
        showToast("⚠️ Este produto está indisponível para pedidos no momento.");
        return;
    }
    cart[productId] = (cart[productId] || 0) + 1;
    saveCart();
    
    updateCartUI();
    updateCardActionUI(productId);
    refreshQuickViewActions(productId);
    showToast("✓ Adicionado ao carrinho de compras!");
}

function updateCartQty(productId, delta, event) {
    if (event) event.stopPropagation();
    if (delta > 0) {
        const product = PRODUCTS.find(p => p.id.toString() === productId.toString());
        if (product && !isProductAvailable(product)) {
            showToast("⚠️ Este produto está indisponível para pedidos no momento.");
            return;
        }
    }
    if (!cart[productId]) {
        if (delta > 0) cart[productId] = delta;
        else return;
    } else {
        cart[productId] += delta;
        if (cart[productId] <= 0) {
            delete cart[productId];
        }
    }
    saveCart();
    updateCartUI();
    updateCardActionUI(productId);
    refreshQuickViewActions(productId);
    renderCartDrawerItems();
}

function getCartStats() {
    let totalCount = 0;
    let totalPrice = 0;

    for (let id in cart) {
        const qty = cart[id];
        const product = PRODUCTS.find(p => p.id.toString() === id.toString());
        if (product) {
            totalCount += qty;
            totalPrice += product.price * qty;
        }
    }
    return { totalCount, totalPrice };
}

function updateCartUI() {
    const { totalCount, totalPrice } = getCartStats();
    const floatingBar = document.getElementById("floating-cart-bar");
    const countBadge = document.getElementById("cart-count-badge");
    const totalEl = document.getElementById("cart-total-text");
    const topCartBtn = document.getElementById("btn-view-cart");
    const topCartBadge = document.getElementById("cart-top-count");

    if (topCartBadge) {
        topCartBadge.textContent = totalCount;
    }
    if (topCartBtn) {
        if (totalCount > 0) {
            topCartBtn.classList.add("has-items");
        } else {
            topCartBtn.classList.remove("has-items");
        }
    }

    if (totalCount > 0) {
        if (floatingBar) {
            floatingBar.classList.add("active");
            floatingBar.style.display = "flex";
            // Animação de pulso sutil ao atualizar valor
            floatingBar.classList.add("pulse-update");
            setTimeout(() => floatingBar.classList.remove("pulse-update"), 400);
        }
        if (countBadge) countBadge.textContent = totalCount;
        if (totalEl) totalEl.textContent = `R$ ${totalPrice.toFixed(2).replace('.', ',')}`;
    } else {
        if (floatingBar) {
            floatingBar.classList.remove("active");
            floatingBar.style.display = "none";
        }
    }
}

// --- MODAL / DRAWER DO CARRINHO ---
function openCartDrawer() {
    const modal = document.getElementById("cart-modal");
    if (!modal) return;
    renderCartDrawerItems();
    modal.classList.add("active");

    // Restaura dados salvos de entrega se existirem
    try {
        const savedBairro = localStorage.getItem("agro_salinas_neighborhood");
        const savedEnd = localStorage.getItem("agro_salinas_address");
        const inputBairro = document.getElementById("checkout-neighborhood");
        const inputEnd = document.getElementById("checkout-address");
        if (savedBairro && inputBairro && !inputBairro.value) inputBairro.value = savedBairro;
        if (savedEnd && inputEnd && !inputEnd.value) inputEnd.value = savedEnd;
    } catch (e) {
        console.warn("Storage de endereço inacessível:", e);
    }

    // Oculta a barra flutuante para nunca sobrepor o modal e os botões
    const floatingBar = document.getElementById("floating-cart-bar");
    if (floatingBar) floatingBar.style.setProperty("display", "none", "important");

    // Atualiza o texto do botão para deixar claro quem vai receber o pedido
    const btnText = document.getElementById("btn-checkout-text");
    const noticeName = document.getElementById("cart-notice-seller-name");
    if (btnText && currentSeller) {
        btnText.textContent = `Enviar Pedido para ${currentSeller.name}`;
    }
    if (noticeName && currentSeller) {
        noticeName.textContent = `${currentSeller.name} (${currentSeller.tag || '#' + currentSeller.code})`;
    }
}

function closeCartDrawer() {
    const modal = document.getElementById("cart-modal");
    if (modal) modal.classList.remove("active");

    // Restaura a visibilidade da barra flutuante se houver itens
    const { totalCount } = getCartStats();
    const floatingBar = document.getElementById("floating-cart-bar");
    if (floatingBar && totalCount > 0) {
        floatingBar.style.display = "flex";
    }
}

function toggleFulfillmentFields(type) {
    const deliveryBox = document.getElementById("delivery-fields-box");
    const pickupBox = document.getElementById("pickup-notice-box");
    if (!deliveryBox || !pickupBox) return;

    if (type === "entrega") {
        deliveryBox.style.display = "flex";
        pickupBox.style.display = "none";
    } else {
        deliveryBox.style.display = "none";
        pickupBox.style.display = "flex";
    }
}

function renderCartDrawerItems() {
    const container = document.getElementById("cart-items-list");
    const totalEl = document.getElementById("drawer-total-price");
    const fulfillmentSection = document.getElementById("checkout-fulfillment-section");
    const paymentSection = document.getElementById("payment-method-selector");
    const checkoutBtn = document.getElementById("btn-cart-checkout");
    if (!container) return;

    const { totalCount, totalPrice } = getCartStats();

    if (totalCount === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                <p style="font-size: 36px; margin-bottom: 8px;">🛒</p>
                <p style="font-weight: 600; font-size: 15px; color: var(--primary-dark);">Sua sacola está vazia</p>
                <p style="font-size: 13px; margin-top: 4px;">Adicione produtos do catálogo para concluir seu pedido!</p>
            </div>
        `;
        if (totalEl) totalEl.textContent = "R$ 0,00";
        if (fulfillmentSection) fulfillmentSection.style.display = "none";
        if (paymentSection) paymentSection.style.display = "none";
        if (checkoutBtn) {
            checkoutBtn.disabled = true;
            checkoutBtn.style.opacity = "0.5";
            checkoutBtn.style.cursor = "not-allowed";
        }
        return;
    }

    if (fulfillmentSection) fulfillmentSection.style.display = "block";
    if (paymentSection) paymentSection.style.display = "block";
    if (checkoutBtn) {
        checkoutBtn.disabled = false;
        checkoutBtn.style.opacity = "1";
        checkoutBtn.style.cursor = "pointer";
    }

    let itemsHtml = "";
    for (let id in cart) {
        const qty = cart[id];
        const product = PRODUCTS.find(p => p.id.toString() === id.toString());
        if (product) {
            const isGranel = product.category === 'granel';
            const unitPrice = `R$ ${product.price.toFixed(2).replace('.', ',')}`;
            const subtotal = `R$ ${(product.price * qty).toFixed(2).replace('.', ',')}`;
            const priceDisplay = qty > 1 ? `${unitPrice} un. • <strong>Total: ${subtotal}</strong>` : unitPrice;
            const title = toTitleCase(product.name);
            const granelBadge = isGranel && product.badge ? `<span style="font-size: 11px; background: #E8F5EE; color: var(--primary); padding: 1px 6px; border-radius: 4px; font-weight: 700; margin-left: 4px;">⚖️ ${product.badge}</span>` : '';

            itemsHtml += `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <div class="cart-item-name">[${product.code}] ${title} ${granelBadge}</div>
                        <div class="cart-item-price">${priceDisplay}</div>
                    </div>
                    <div class="cart-item-controls">
                        <button class="qty-btn" onclick="updateCartQty('${product.id}', -1)" title="Diminuir quantidade">−</button>
                        <span class="qty-display">${qty}</span>
                        <button class="qty-btn" onclick="updateCartQty('${product.id}', 1)" title="Aumentar quantidade">+</button>
                    </div>
                </div>
            `;
        }
    }

    container.innerHTML = itemsHtml;
    if (totalEl) totalEl.textContent = `R$ ${totalPrice.toFixed(2).replace('.', ',')}`;
}

// --- GERAÇÃO DE MENSAGEM DO WHATSAPP (PRESERVA TODAS AS REGRAS DE GRANEL & ENCODE SEGURO) ---
function checkoutWhatsApp() {
    const { totalCount, totalPrice } = getCartStats();
    if (totalCount === 0) {
        showToast("Seu carrinho está vazio!");
        return;
    }

    // Modalidade de Atendimento: Entrega a Domicílio vs Retirada no Balcão
    const selectedFulfillmentInput = document.querySelector('input[name="checkout_fulfillment"]:checked');
    const fulfillmentType = selectedFulfillmentInput ? selectedFulfillmentInput.value : "entrega";

    let fulfillmentDetailsText = "";

    if (fulfillmentType === "entrega") {
        const inputNeighborhood = document.getElementById("checkout-neighborhood");
        const inputAddress = document.getElementById("checkout-address");
        const inputComplement = document.getElementById("checkout-complement");

        const neighborhood = inputNeighborhood ? inputNeighborhood.value.trim() : "";
        const address = inputAddress ? inputAddress.value.trim() : "";
        const complement = inputComplement ? inputComplement.value.trim() : "";

        if (!neighborhood || !address) {
            showToast("⚠️ Por favor, informe Bairro e Endereço para entrega!");
            if (!neighborhood && inputNeighborhood) {
                inputNeighborhood.focus();
                inputNeighborhood.style.borderColor = "#DC2626";
                setTimeout(() => inputNeighborhood.style.borderColor = "", 2500);
            } else if (!address && inputAddress) {
                inputAddress.focus();
                inputAddress.style.borderColor = "#DC2626";
                setTimeout(() => inputAddress.style.borderColor = "", 2500);
            }
            return;
        }

        // Salva dados no localStorage para agilizar compras futuras
        try {
            localStorage.setItem("agro_salinas_neighborhood", neighborhood);
            localStorage.setItem("agro_salinas_address", address);
        } catch (e) {
            console.warn("Storage inacessível:", e);
        }

        fulfillmentDetailsText = 
`🚚 *Modalidade:* Entrega a Domicílio
📍 *Bairro:* ${neighborhood}
🏠 *Endereço:* ${address}${complement ? `\n📌 *Complemento/Ref:* ${complement}` : ''}`;

    } else {
        fulfillmentDetailsText = 
`🏪 *Modalidade:* Retirada no Balcão (Loja Agro Salinas)
📦 *Separação:* Aguardando confirmação para retirar no balcão`;
    }

    let itemsText = "";
    for (let id in cart) {
        const qty = cart[id];
        const product = PRODUCTS.find(p => p.id.toString() === id.toString());
        if (product) {
            const isGranel = product.category === 'granel';
            const unitPriceStr = product.price.toFixed(2).replace('.', ',');
            const subtotal = product.price * qty;
            const subtotalStr = subtotal.toFixed(2).replace('.', ',');
            const prodTitle = toTitleCase(product.name);

            if (isGranel) {
                const packBadge = product.badge || `Pacote ${product.unit || 'Kg'}`;
                const extraInfo = product.extraInfo ? ` (${product.extraInfo})` : '';
                if (qty > 1) {
                    itemsText += `⚖️ *${qty}x* [CÓD ${product.code}] ${prodTitle}\n   ↳ *${packBadge}* Fechado e Selado${extraInfo}\n   ↳ Unitário: R$ ${unitPriceStr} | Subtotal: *R$ ${subtotalStr}*\n`;
                } else {
                    itemsText += `⚖️ *1x* [CÓD ${product.code}] ${prodTitle}\n   ↳ *${packBadge}* Fechado e Selado${extraInfo} — *R$ ${unitPriceStr}*\n`;
                }
            } else {
                if (qty > 1) {
                    itemsText += `📦 *${qty}x* [CÓD ${product.code}] ${prodTitle}\n   ↳ Unitário: R$ ${unitPriceStr} | Subtotal: *R$ ${subtotalStr}*\n`;
                } else {
                    itemsText += `📦 *1x* [CÓD ${product.code}] ${prodTitle} — *R$ ${unitPriceStr}*\n`;
                }
            }
        }
    }

    // Identifica a forma de pagamento selecionada pelo cliente
    const selectedPayInput = document.querySelector('input[name="checkout_payment"]:checked');
    const paymentMethod = selectedPayInput ? selectedPayInput.value : "A combinar";

    // Identifica o WhatsApp de destino: se o cliente veio por vendedor, vai para ele
    const targetWhatsapp = currentSeller.whatsapp || (typeof VENDAS_CONFIG !== 'undefined' ? VENDAS_CONFIG.lojaWhatsApp : STORE_CONFIG.whatsappNumber);

    const message = 
`*🛒 OLÁ! GOSTARIA DE FAZER ESSE PEDIDO:*
----------------------------------
${itemsText}----------------------------------
*💰 TOTAL DO PEDIDO: R$ ${totalPrice.toFixed(2).replace('.', ',')}*
💳 *Forma de Pagamento:* ${paymentMethod}

${fulfillmentDetailsText}

👤 *Consultor(a) Atendente:* ${currentSeller.name} (${currentSeller.tag})
📱 *Origem:* Catálogo Digital Agro Salinas

Poderia me confirmar a disponibilidade e o prazo de separação/despacho? Obrigado!`;

    const whatsappUrl = `https://wa.me/${targetWhatsapp}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
}

function quickBuyWhatsApp(productId) {
    const product = PRODUCTS.find(p => p.id.toString() === productId.toString());
    if (!product) return;

    const targetWhatsapp = currentSeller.whatsapp || (typeof VENDAS_CONFIG !== 'undefined' ? VENDAS_CONFIG.lojaWhatsApp : STORE_CONFIG.whatsappNumber);
    const isGranel = product.category === 'granel';
    const prodTitle = toTitleCase(product.name);
    const isAvailable = isProductAvailable(product);

    let message = "";
    if (isGranel) {
        const packBadge = product.badge || `Pacote ${product.unit || 'Kg'}`;
        const extraInfo = product.extraInfo ? ` (${product.extraInfo})` : '';
        if (!isAvailable) {
            message = 
`*👋 Olá, ${currentSeller.name}!*
Gostaria de saber a previsão de disponibilidade deste produto a granel no catálogo Agro Salinas:

⚖️ *[CÓD ${product.code}] ${prodTitle}*
📦 *Embalagem:* ${packBadge} Fechado e Selado${extraInfo}
💰 *Preço de referência:* R$ ${product.price.toFixed(2).replace('.', ',')}

🏷️ *Consultor(a):* ${currentSeller.name} (${currentSeller.tag})`;
        } else {
            message = 
`*👋 Olá, ${currentSeller.name}!*
Tenho interesse neste produto a granel do catálogo Agro Salinas:

⚖️ *[CÓD ${product.code}] ${prodTitle}*
📦 *Embalagem:* ${packBadge} Fechado e Selado${extraInfo}
💰 *Preço:* R$ ${product.price.toFixed(2).replace('.', ',')}

🏷️ *Consultor(a):* ${currentSeller.name} (${currentSeller.tag})`;
        }
    } else {
        if (!isAvailable) {
            message = 
`*👋 Olá, ${currentSeller.name}!*
Gostaria de saber a previsão de disponibilidade deste produto no catálogo Agro Salinas:

📦 *[CÓD ${product.code}] ${prodTitle}*
💰 *Preço de referência:* R$ ${product.price.toFixed(2).replace('.', ',')} / ${product.unit || 'un'}

🏷️ *Consultor(a):* ${currentSeller.name} (${currentSeller.tag})`;
        } else {
            message = 
`*👋 Olá, ${currentSeller.name}!*
Tenho interesse no seguinte produto do catálogo Agro Salinas:

📦 *[CÓD ${product.code}] ${prodTitle}*
💰 *Preço:* R$ ${product.price.toFixed(2).replace('.', ',')} / ${product.unit || 'un'}

🏷️ *Consultor(a):* ${currentSeller.name} (${currentSeller.tag})`;
        }
    }

    const whatsappUrl = `https://wa.me/${targetWhatsapp}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
}

// --- GERADOR DE LINK PARA VENDEDORES ---
function openSellerGenerator() {
    const modal = document.getElementById("seller-modal-overlay");
    if (modal) {
        const input = document.getElementById("input-seller-name");
        if (input) input.value = currentSeller.name;
        updateGeneratedLink();
        modal.classList.add("active");
    }
}

function closeSellerGenerator() {
    const modal = document.getElementById("seller-modal-overlay");
    if (modal) modal.classList.remove("active");
}

function updateGeneratedLink() {
    const input = document.getElementById("input-seller-name");
    const preview = document.getElementById("generated-link-preview");
    if (!input || !preview) return;

    const name = input.value.trim().toLowerCase().replace(/\s+/g, "") || "seunome";
    const baseUrl = window.location.origin + window.location.pathname;
    const finalUrl = `${baseUrl}?v=${encodeURIComponent(name)}`;
    preview.textContent = finalUrl;
}

function copySellerLink() {
    const preview = document.getElementById("generated-link-preview");
    if (!preview) return;

    navigator.clipboard.writeText(preview.textContent).then(() => {
        showToast("Link copiado com sucesso!");
        setTimeout(() => closeSellerGenerator(), 800);
    }).catch(() => {
        prompt("Copie seu link abaixo:", preview.textContent);
    });
}

// --- EVENTOS & BUSCA (COM DEBOUNCE DE 300MS) ---
function setupEventListeners() {
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                searchQuery = e.target.value;
                renderProducts();
            }, 300);
        });
    }

    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) {
        sortSelect.addEventListener("change", (e) => {
            currentSort = e.target.value;
            renderProducts();
        });
    }

    const priceRangeSelect = document.getElementById("price-range-select");
    if (priceRangeSelect) {
        priceRangeSelect.addEventListener("change", (e) => {
            currentPriceRange = e.target.value;
            renderProducts();
        });
    }

    const inputSeller = document.getElementById("input-seller-name");
    if (inputSeller) {
        inputSeller.addEventListener("input", updateGeneratedLink);
    }
}

// --- GERENCIAMENTO DE FAVORITOS ---
function toggleFavorite(productId, event) {
    if (event) event.stopPropagation();
    const idStr = productId.toString();
    const index = favorites.indexOf(idStr);

    if (index > -1) {
        favorites.splice(index, 1);
        showToast("Removido dos favoritos");
    } else {
        favorites.push(idStr);
        showToast("Salvo nos favoritos! 🧡");
    }

    saveFavorites();
    updateFavoritesUI();

    // Se estiver na tela exclusiva de favoritos, re-renderiza a lista filtrada
    if (showOnlyFavorites) {
        renderProducts();
    } else {
        // Atualiza somente o ícone do card específico sem refazer o DOM
        const cardFavBtn = document.querySelector(`#card-${productId} .btn-fav-card`);
        if (cardFavBtn) {
            const isFav = favorites.includes(idStr);
            cardFavBtn.classList.toggle("active", isFav);
            cardFavBtn.innerHTML = isFav ? '🧡' : '🤍';
            cardFavBtn.title = isFav ? 'Remover dos favoritos' : 'Favoritar produto';
        }
    }
}

function toggleFavoritesFilter() {
    showOnlyFavorites = !showOnlyFavorites;
    const btn = document.getElementById("btn-view-favorites");
    if (btn) {
        if (showOnlyFavorites) btn.classList.add("active");
        else btn.classList.remove("active");
    }
    renderProducts();
}

function updateFavoritesUI() {
    const countEl = document.getElementById("fav-count");
    const btn = document.getElementById("btn-view-favorites");
    if (countEl) countEl.textContent = favorites.length;
    if (btn) {
        if (showOnlyFavorites) btn.classList.add("active");
        else btn.classList.remove("active");
    }
}

// --- RESETAR TODOS OS FILTROS ---
function resetAllFilters() {
    currentCategory = "todos";
    currentSubcategory = "todas";
    currentSort = "default";
    currentPriceRange = "all";
    searchQuery = "";
    showOnlyFavorites = false;

    const searchInput = document.getElementById("search-input");
    if (searchInput) searchInput.value = "";

    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) sortSelect.value = "default";
    const sidebarSortSelect = document.getElementById("sidebar-sort-select");
    if (sidebarSortSelect) sidebarSortSelect.value = "default";

    const priceRangeSelect = document.getElementById("price-range-select");
    if (priceRangeSelect) priceRangeSelect.value = "all";
    const sidebarPriceSelect = document.getElementById("sidebar-price-select");
    if (sidebarPriceSelect) sidebarPriceSelect.value = "all";

    const btnFav = document.getElementById("btn-view-favorites");
    if (btnFav) btnFav.classList.remove("active");

    currentQuickTag = null;
    document.querySelectorAll(".quick-tag-pill, .sidebar-tag-btn").forEach(p => p.classList.remove("active"));

    renderCategories();
    renderSubcategories();
    renderProducts();
    updateFavoritesUI();
    showToast("Filtros resetados!");
}

// --- CONTROLE DOS FILTROS RÁPIDOS (NECESSIDADE DO PET) ---
function toggleQuickTag(tagKey, btnElement) {
    if (currentQuickTag === tagKey) {
        currentQuickTag = null;
    } else {
        currentQuickTag = tagKey;
    }

    // Sincronizar tanto as tags desktop quanto as do menu lateral
    document.querySelectorAll(".quick-tag-pill, .sidebar-tag-btn").forEach(btn => {
        const isTarget = btn.getAttribute("data-tag") === currentQuickTag;
        btn.classList.toggle("active", isTarget);
    });

    renderProducts();
}

// --- CONTROLES DO MENU LATERAL / SIDEBAR DRAWER ---
function openSidebarDrawer() {
    const drawer = document.getElementById("sidebar-drawer");
    const overlay = document.getElementById("sidebar-overlay");
    if (drawer && overlay) {
        // Sincronizar os selects do drawer com o estado atual
        const sidebarSort = document.getElementById("sidebar-sort-select");
        if (sidebarSort) sidebarSort.value = currentSort;

        const sidebarPrice = document.getElementById("sidebar-price-select");
        if (sidebarPrice) sidebarPrice.value = currentPriceRange;

        overlay.classList.add("active");
        drawer.classList.add("active");
        document.body.style.overflow = "hidden"; // Trava o scroll da página enquanto o drawer está aberto
    }
}

function closeSidebarDrawer() {
    const drawer = document.getElementById("sidebar-drawer");
    const overlay = document.getElementById("sidebar-overlay");
    if (drawer && overlay) {
        overlay.classList.remove("active");
        drawer.classList.remove("active");
        document.body.style.overflow = ""; // Restaura o scroll
    }
}

function syncSortFromSidebar(value) {
    currentSort = value;
    const desktopSelect = document.getElementById("sort-select");
    if (desktopSelect) desktopSelect.value = value;
    renderProducts();
}

function syncPriceFromSidebar(value) {
    currentPriceRange = value;
    const desktopSelect = document.getElementById("price-range-select");
    if (desktopSelect) desktopSelect.value = value;
    renderProducts();
}

// --- TOAST NOTIFICATION ---
function showToast(message) {
    let toast = document.getElementById("toast-notification");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast-notification";
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(27, 67, 46, 0.95);
            color: white;
            padding: 10px 20px;
            border-radius: 30px;
            font-size: 14px;
            font-weight: 600;
            z-index: 9999;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
            opacity: 0;
            pointer-events: none;
        `;
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.opacity = "1";
    toast.style.transform = "translateX(-50%) translateY(10px)";

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(-50%) translateY(0)";
    }, 2000);
}

// --- MODAL DE DETALHES RÁPIDOS (QUICK VIEW) ---
function openQuickView(productId) {
    const product = PRODUCTS.find(p => p.id.toString() === productId.toString());
    if (!product) return;

    const modal = document.getElementById("quickview-modal");
    const modalContent = document.getElementById("quickview-modal-card");
    if (!modal || !modalContent) return;

    const title = toTitleCase(product.name);
    const cat = CATEGORIES.find(c => c.id === product.category);
    const catName = cat ? `${cat.icon} ${cat.name}` : (product.category || "Pet");
    const subcatName = product.subcategory || catName;
    const isGranel = product.category === 'granel';
    const unitPrice = `R$ ${product.price.toFixed(2).replace('.', ',')}`;
    const unitText = product.unit ? `/ ${product.unit}` : (isGranel ? '/ pct' : '/ un');
    const granelBadge = isGranel && product.badge ? `<span style="font-size: 12px; background: #E8F5EE; color: var(--primary); padding: 2px 8px; border-radius: 6px; font-weight: 800;">⚖️ ${product.badge}</span>` : '';

    // Imagem do produto com fallback limpo
    const placeholderSvg = `
        <div class="product-placeholder-box" style="padding: 20px;">
            <svg class="placeholder-svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg" style="width: 54px; height: 54px;">
                <path d="M20 12 L44 12 L48 22 L48 54 C48 56.2 46.2 58 44 58 L20 58 C17.8 58 16 56.2 16 54 L16 22 Z" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M20 12 L24 8 L40 8 L44 12" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M16 22 L48 22" stroke-width="2" stroke-linecap="round"/>
                <circle cx="32" cy="38" r="8" stroke-width="2" opacity="0.35"/>
            </svg>
            <span class="product-placeholder-tag" style="margin-top: 6px;">${catName}</span>
        </div>
    `;

    const imageHtml = product.image ? `
        <div class="quickview-image-wrap">
            <img src="${product.image}" alt="${title}" class="quickview-img" onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';">
            <div class="quickview-fallback-wrap" style="display:none; width:100%; height:100%; align-items:center; justify-content:center;">
                ${placeholderSvg}
            </div>
        </div>
    ` : `
        <div class="quickview-image-wrap">
            ${placeholderSvg}
        </div>
    `;

    // Inferência de Tags e Porte/Idade
    const lower = (product.name + " " + (product.subcategory || "")).toLowerCase();
    const tags = [];
    
    // Espécie
    if (product.category === 'caes' || lower.includes('cão') || lower.includes('cao') || lower.includes('cães') || lower.includes('dog') || lower.includes('canino')) {
        tags.push('<span class="profile-tag">🐶 Cão</span>');
    } else if (product.category === 'gatos' || lower.includes('gato') || lower.includes('cat') || lower.includes('felino') || lower.includes('pipicat')) {
        tags.push('<span class="profile-tag">🐱 Gato</span>');
    } else if (product.category === 'passaros' || lower.includes('canario') || lower.includes('calopsita') || lower.includes('passaro') || lower.includes('ave')) {
        tags.push('<span class="profile-tag">🦜 Pássaro / Ave</span>');
    } else if (product.category === 'peixes' || lower.includes('peixe') || lower.includes('aquario')) {
        tags.push('<span class="profile-tag">🐟 Peixe</span>');
    } else if (product.category === 'farmacia') {
        tags.push('<span class="profile-tag">💊 Linha Farmacêutica</span>');
    }

    // Fase da vida
    if (lower.includes('filhote') || lower.includes('puppy') || lower.includes('junior')) {
        tags.push('<span class="profile-tag highlight">🍼 Filhote</span>');
    } else if (lower.includes('senior') || lower.includes('sênior') || lower.includes('+7') || lower.includes('maduro')) {
        tags.push('<span class="profile-tag highlight">👴 Sênior (+7 Anos)</span>');
    } else if (lower.includes('adulto') || lower.includes('adult')) {
        tags.push('<span class="profile-tag">🐕 Adulto</span>');
    }

    // Porte
    if (lower.includes('pequeno') || lower.includes('mini') || lower.includes('pequenas') || lower.includes('small')) {
        tags.push('<span class="profile-tag">🐾 Raças Pequenas</span>');
    } else if (lower.includes('medio') || lower.includes('médio') || lower.includes('medium')) {
        tags.push('<span class="profile-tag">🐕 Raças Médias</span>');
    } else if (lower.includes('grande') || lower.includes('gigante') || lower.includes('maxi')) {
        tags.push('<span class="profile-tag">🐾 Raças Grandes / Gigantes</span>');
    }

    // Necessidade especial
    if (lower.includes('castrado') || lower.includes('castrados') || lower.includes('steril')) {
        tags.push('<span class="profile-tag highlight">✂️ Castrados / Peso Ideal</span>');
    }
    if (lower.includes('pele sensivel') || lower.includes('sensivel') || lower.includes('sensível') || lower.includes('sensitive')) {
        tags.push('<span class="profile-tag highlight">🌾 Pele & Digestão Sensível</span>');
    }

    // Bloco de Orientação e Dosagem
    let guideSectionHtml = "";
    const isDog = product.category === 'caes' || lower.includes('cão') || lower.includes('cao') || lower.includes('cães') || lower.includes('dog');
    const isCat = product.category === 'gatos' || lower.includes('gato') || lower.includes('cat') || lower.includes('felino') || lower.includes('pipicat');
    const isLitter = lower.includes('areia') || lower.includes('pipicat') || lower.includes('sanit') || lower.includes('granulado');
    const isPharmacy = product.category === 'farmacia' || lower.includes('shampoo') || lower.includes('sabonete') || lower.includes('vermif') || lower.includes('coleira') || lower.includes('pipeta');

    if (isLitter) {
        guideSectionHtml = `
            <div class="quickview-section-card">
                <div class="quickview-section-title">
                    <span>🚽 Modo de Uso e Higiene</span>
                </div>
                <div style="font-size: 12px; color: #334155; line-height: 1.5; padding: 4px 0;">
                    <p>1. Preencha a caixa de areia com uma camada uniforme de <strong>5cm a 7cm</strong> de altura.</p>
                    <p style="margin-top: 4px;">2. O produto forma torrões firmes que facilitam a remoção diária das fezes e urina com uma pá higiênica.</p>
                    <p style="margin-top: 4px;">3. Complete o nível para manter a altura inicial. Substitua todo o conteúdo periodicamente lavando a bandeja com água morna e sabão neutro.</p>
                </div>
                <div class="quickview-tip">
                    💡 <em>Rendimento Máximo:</em> Manter a camada na altura ideal evita que a urina atinja o fundo da bandeja, controlando odores com muito mais eficiência.
                </div>
            </div>
        `;
    } else if (isPharmacy) {
        guideSectionHtml = `
            <div class="quickview-section-card">
                <div class="quickview-section-title">
                    <span>💊 Orientação e Uso Veterinário</span>
                </div>
                <div style="font-size: 12px; color: #334155; line-height: 1.5; padding: 4px 0;">
                    <p>• Produto veterinário sujeito à dosagem por peso corporal do pet.</p>
                    <p style="margin-top: 4px;">• Consulte a bula do fabricante ou seu médico-veterinário de confiança para determinar a dosagem exata e o tempo de uso indicado.</p>
                    <p style="margin-top: 4px;">• Em caso de dúvidas sobre qual o produto ideal para o peso e idade do seu pet, chame nossos atendentes no WhatsApp!</p>
                </div>
                <div class="quickview-tip">
                    💡 <em>Dúvida no Peso ou Dosagem?</em> Nosso consultor no WhatsApp pode te orientar na escolha do antiparasitário ou medicamento correto!
                </div>
            </div>
        `;
    } else if (isDog) {
        guideSectionHtml = `
            <div class="quickview-section-card">
                <div class="quickview-section-title">
                    <span>🥣 Guia de Consumo Diário Recomendado</span>
                </div>
                <table class="quickview-dosage-table">
                    <thead>
                        <tr>
                            <th>Porte / Peso do Cão</th>
                            <th>Quantidade Indicada</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Mini / Toy (1 a 5 kg)</td>
                            <td><strong>35g a 95g</strong> / dia</td>
                        </tr>
                        <tr>
                            <td>Pequeno (5 a 10 kg)</td>
                            <td><strong>95g a 160g</strong> / dia</td>
                        </tr>
                        <tr>
                            <td>Médio (10 a 25 kg)</td>
                            <td><strong>160g a 310g</strong> / dia</td>
                        </tr>
                        <tr>
                            <td>Grande (25 a 45 kg+)</td>
                            <td><strong>310g a 490g+</strong> / dia</td>
                        </tr>
                    </tbody>
                </table>
                <div class="quickview-tip">
                    💡 <em>Dica Agro Salinas:</em> Fracione em 2 a 3 porções ao longo do dia. Mantenha um pote de água limpa e fresca sempre acessível ao pet.
                </div>
            </div>
        `;
    } else if (isCat) {
        guideSectionHtml = `
            <div class="quickview-section-card">
                <div class="quickview-section-title">
                    <span>🥣 Guia de Consumo Diário Recomendado</span>
                </div>
                <table class="quickview-dosage-table">
                    <thead>
                        <tr>
                            <th>Perfil / Peso do Gato</th>
                            <th>Quantidade Indicada</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Gato Pequeno (2 a 3 kg)</td>
                            <td><strong>35g a 50g</strong> / dia</td>
                        </tr>
                        <tr>
                            <td>Gato Médio (3 a 5 kg)</td>
                            <td><strong>50g a 75g</strong> / dia</td>
                        </tr>
                        <tr>
                            <td>Castrado ou Porte Maior (5 a 7 kg)</td>
                            <td><strong>60g a 80g</strong> / dia</td>
                        </tr>
                    </tbody>
                </table>
                <div class="quickview-tip">
                    💡 <em>Dica Agro Salinas:</em> Gatos gostam de frescor! Sirva em tigelas largas para não encostar os bigodes e mantenha a água distante da comida.
                </div>
            </div>
        `;
    } else if (isGranel) {
        guideSectionHtml = `
            <div class="quickview-section-card">
                <div class="quickview-section-title">
                    <span>⚖️ Selagem e Qualidade Agro Salinas</span>
                </div>
                <div style="font-size: 12px; color: #334155; line-height: 1.5; padding: 4px 0;">
                    <p>• <strong>Pacote Selado:</strong> Pesado na medida exata com selagem higiênica que impede a entrada de umidade.</p>
                    <p style="margin-top: 4px;">• <strong>Nutrientes Preservados:</strong> Aroma, textura crocante e integridade nutricional idênticos ao pacote lacrado de fábrica.</p>
                    <p style="margin-top: 4px;">• <strong>Economia Inteligente:</strong> A melhor ração para o seu companheiro com preço muito mais acessível por quilo.</p>
                </div>
                <div class="quickview-tip">
                    💡 <em>Armazenamento:</em> Mantenha em local seco e arejado, fechando bem após o uso diário.
                </div>
            </div>
        `;
    } else {
        guideSectionHtml = `
            <div class="quickview-section-card">
                <div class="quickview-section-title">
                    <span>🌱 Cuidados e Modo de Servir</span>
                </div>
                <div style="font-size: 12px; color: #334155; line-height: 1.5; padding: 4px 0;">
                    <p>• Fornecer diariamente em comedouro limpo, higienizado e seco.</p>
                    <p style="margin-top: 4px;">• Descartar as sobras e cascas antes de abastecer com nova porção.</p>
                    <p style="margin-top: 4px;">• Água potável, fresca e limpa deve estar permanentemente à disposição.</p>
                </div>
            </div>
        `;
    }

    const isAvailable = isProductAvailable(product);
    const unavailableBadge = !isAvailable ? `<span class="quickview-unavailable-tag">🚫 Indisponível no Momento</span>` : '';

    modalContent.innerHTML = `
        <button class="btn-close-quickview" onclick="closeQuickViewModal()" title="Fechar janela (Esc)">✕</button>
        <div class="quickview-grid">
            ${imageHtml}
            <div class="quickview-header-info">
                <div class="quickview-meta-row">
                    <span class="quickview-code-tag">CÓD ${product.code}</span>
                    <span class="quickview-cat-tag">${subcatName}</span>
                    ${granelBadge}
                    ${unavailableBadge}
                </div>
                <h2 class="quickview-title">${title}</h2>
                ${tags.length > 0 ? `<div class="quickview-profile-tags">${tags.join('')}</div>` : ''}
            </div>

            <div class="quickview-price-box">
                <div>
                    <span style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px;">Preço Agro Salinas:</span>
                    <div class="quickview-price-main">
                        <span class="quickview-curr">R$</span>
                        <span class="quickview-price-val">${product.price.toFixed(2).replace('.', ',')}</span>
                        <span class="quickview-unit">${unitText}</span>
                    </div>
                </div>
            </div>

            ${guideSectionHtml}

            <div class="quickview-actions-bar" id="quickview-actions-${product.id}">
                <!-- Atualizado via refreshQuickViewActions -->
            </div>
        </div>
    `;

    refreshQuickViewActions(product.id);
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeQuickViewModal() {
    const modal = document.getElementById("quickview-modal");
    if (modal) {
        modal.classList.remove("active");
        document.body.style.overflow = "";
    }
}

function refreshQuickViewActions(productId) {
    const container = document.getElementById(`quickview-actions-${productId}`);
    if (!container) return;

    const product = PRODUCTS.find(p => p.id.toString() === productId.toString());
    if (!product) return;

    const isAvailable = isProductAvailable(product);
    const qtyInCart = cart[productId] || 0;
    const isGranel = product.category === 'granel';

    let cartActionHtml = "";
    if (!isAvailable) {
        cartActionHtml = `
            <button class="btn-add-cart btn-unavailable" style="width: 100%; height: 46px; font-size: 15px; font-weight: 800;" disabled title="Item indisponível para pedidos no momento">
                <span class="btn-cart-icon">🚫</span>
                <span class="btn-cart-text">Indisponível para Compra</span>
            </button>
        `;
    } else if (qtyInCart > 0) {
        cartActionHtml = `
            <div class="card-qty-selector ${isGranel ? 'granel-qty-selector' : ''}" style="width: 100%; justify-content: space-between; height: 46px;">
                <button class="card-qty-btn minus" style="width: 46px; height: 46px; font-size: 22px;" onclick="updateCartQty('${product.id}', -1, event)" title="Diminuir quantidade" aria-label="Diminuir quantidade">−</button>
                <span class="card-qty-display">
                    <span class="card-qty-val" style="font-size: 17px;">${qtyInCart}</span>
                    <span class="card-qty-label" style="font-size: 11px;">${isGranel ? 'pct no carrinho' : 'no carrinho'}</span>
                </span>
                <button class="card-qty-btn plus" style="width: 46px; height: 46px; font-size: 22px;" onclick="updateCartQty('${product.id}', 1, event)" title="Aumentar quantidade" aria-label="Aumentar quantidade">+</button>
            </div>
        `;
    } else {
        cartActionHtml = `
            <button class="btn-add-cart ${isGranel ? 'btn-add-cart-granel' : ''}" style="width: 100%; height: 46px; font-size: 15px; font-weight: 800;" onclick="addToCart('${product.id}', event)">
                <span class="btn-cart-icon">${CART_ICON_SVG}</span>
                <span class="btn-cart-text">${isGranel ? 'Adicionar Pacote ao Carrinho' : 'Adicionar ao Carrinho'}</span>
            </button>
        `;
    }

    container.innerHTML = cartActionHtml;
}

// --- BOTÃO VOLTAR AO TOPO & CONTROLE DE SCROLL ---
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener("scroll", () => {
    const btn = document.getElementById("btn-back-to-top");
    if (btn) {
        if (window.scrollY > 350) {
            btn.classList.add("visible");
        } else {
            btn.classList.remove("visible");
        }
    }
}, { passive: true });

// Tecla ESC para fechar qualquer gaveta ou modal ativo
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.keyCode === 27) {
        closeQuickViewModal();
        closeCartDrawer();
        closeSidebarDrawer();
    }
});
