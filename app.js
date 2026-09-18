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

    // HTML Desktop (Pills horizontais)
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
        sidebarContainer.innerHTML = CATEGORIES.map(cat => {
            const count = cat.id === 'todos' 
                ? PRODUCTS.length 
                : PRODUCTS.filter(p => p.category === cat.id).length;

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

    // Obter todas as subcategorias únicas desta categoria
    const categoryProducts = PRODUCTS.filter(p => p.category === currentCategory);
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
        <div class="product-image-container">
            <img src="${product.image}" alt="${productName}" class="product-img" loading="lazy" decoding="async" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'product-placeholder-box\\'><svg class=\\'placeholder-svg\\' viewBox=\\'0 0 64 64\\' fill=\\'none\\' stroke=\\'currentColor\\' xmlns=\\'http://www.w3.org/2000/svg\\'><path d=\\'M20 12 L44 12 L48 22 L48 54 C48 56.2 46.2 58 44 58 L20 58 C17.8 58 16 56.2 16 54 L16 22 Z\\' stroke-width=\\'2.2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'/><path d=\\'M20 12 L24 8 L40 8 L44 12\\' stroke-width=\\'2.2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'/><path d=\\'M16 22 L48 22\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\'/><circle cx=\\'32\\' cy=\\'38\\' r=\\'8\\' stroke-width=\\'2\\' opacity=\\'0.35\\'/></svg><span class=\\'product-placeholder-tag\\'>${catName}</span></div>';">
        </div>
    ` : `
        <div class="product-image-container">
            ${placeholderSvg}
        </div>
    `;

    return `
        <div class="product-card ${isGranel ? 'product-card-granel' : ''}" id="card-${product.id}">
            <div class="card-top-actions">
                <button class="btn-fav-card ${isFav ? 'active' : ''}" onclick="toggleFavorite('${product.id}', event)" title="${isFav ? 'Remover dos favoritos' : 'Favoritar produto'}" aria-label="Favoritar">
                    ${isFav ? '❤️' : '🤍'}
                </button>
                <button class="btn-zap-card" onclick="quickBuyWhatsApp('${product.id}')" title="Tirar dúvidas ou pedir este item no WhatsApp" aria-label="Pedir no WhatsApp">
                    <span>💬</span>
                </button>
            </div>
            ${product.badge ? `<span class="product-badge ${isGranel ? 'badge-granel' : ''}">${isGranel ? '⚖️ ' + product.badge : product.badge}</span>` : ''}
            ${imageHtml}
            <div class="card-info-wrap">
                <div class="product-meta-line">
                    <span class="meta-code">Cód: ${product.code}</span>
                    <span class="meta-sep">•</span>
                    <span class="meta-cat">${product.subcategory || catName}</span>
                </div>
                <h3 class="product-name" title="${productName}">${productName}</h3>
            </div>
            
            <div class="product-footer">
                ${isGranel ? `
                    <div class="granel-highlight-card">
                        <div class="granel-top-info">
                            <span class="granel-weight-pill">⚖️ Pacote: <strong>${product.badge ? product.badge.replace('Pacote ', '') : (product.unit || 'Kg')}</strong></span>
                            ${product.extraInfo ? `<span class="granel-kg-pill">${product.extraInfo.replace(/.*?\(/, '').replace(')', '')}</span>` : ''}
                        </div>
                        
                        <div class="granel-price-banner">
                            <span class="granel-price-label">VALOR DO PACOTE FECHADO:</span>
                            <div class="granel-price-number">
                                <span class="granel-curr">R$</span>
                                <span class="granel-val">${product.price.toFixed(2).replace('.', ',')}</span>
                            </div>
                            <div class="granel-trust-tag">
                                <span class="trust-icon">✓</span>
                                <span>Embalagem pesada e selada</span>
                            </div>
                        </div>
                    </div>
                ` : `
                    <div class="price-row">
                        <div>
                            <span class="price-label">PREÇO</span>
                            <div class="price-value">R$ ${product.price.toFixed(2).replace('.', ',')}</div>
                        </div>
                        <span class="price-unit">/${product.unit || 'un'}</span>
                    </div>
                `}

                <div class="card-actions">
                    ${qtyInCart > 0 ? `
                        <div class="card-qty-selector ${isGranel ? 'granel-qty-selector' : ''}" id="qty-selector-${product.id}">
                            <button class="card-qty-btn minus" onclick="updateCartQty('${product.id}', -1, event)" title="Diminuir quantidade" aria-label="Diminuir quantidade">−</button>
                            <span class="card-qty-display">
                                <span class="card-qty-val">${qtyInCart}</span>
                                <span class="card-qty-label">${isGranel ? 'pct no cesto' : 'no cesto'}</span>
                            </span>
                            <button class="card-qty-btn plus" onclick="updateCartQty('${product.id}', 1, event)" title="Aumentar quantidade" aria-label="Aumentar quantidade">+</button>
                        </div>
                    ` : `
                        <button class="btn-add-cart ${isGranel ? 'btn-add-cart-granel' : ''}" id="btn-add-${product.id}" onclick="addToCart('${product.id}', event)">
                            <span class="btn-cart-icon">🛒</span>
                            <span class="btn-cart-text">${isGranel ? 'Adicionar Pacote ao Cesto' : 'Adicionar ao Cesto'}</span>
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
            titleEl.textContent = "❤️ Meus Produtos Favoritos";
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
    allFilteredProducts = PRODUCTS.filter(p => {
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

    // Ordenação
    if (currentSort === "price_asc") {
        allFilteredProducts.sort((a, b) => a.price - b.price);
    } else if (currentSort === "price_desc") {
        allFilteredProducts.sort((a, b) => b.price - a.price);
    } else if (currentSort === "name_asc") {
        allFilteredProducts.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    } else {
        // default: Destaques primeiro, depois alfabético
        allFilteredProducts.sort((a, b) => {
            if (a.featured && !b.featured) return -1;
            if (!a.featured && b.featured) return 1;
            return a.name.localeCompare(b.name, 'pt-BR');
        });
    }

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

    // Contador
    if (countEl) {
        countEl.textContent = `${allFilteredProducts.length} produto${allFilteredProducts.length === 1 ? '' : 's'}`;
    }

    // Estado Vazio
    if (allFilteredProducts.length === 0) {
        if (scrollObserver) scrollObserver.disconnect();
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 50px 20px; background: white; border-radius: 14px; border: 1px dashed var(--border-color); box-shadow: var(--shadow-sm);">
                <p style="font-size: 36px; margin-bottom: 8px;">${showOnlyFavorites ? '❤️' : '🔍'}</p>
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

// Atualização pontual do botão de um card sem re-renderizar todo o catálogo
function updateCardActionUI(productId) {
    const card = document.getElementById(`card-${productId}`);
    if (!card) return;
    const product = PRODUCTS.find(p => p.id.toString() === productId.toString());
    if (!product) return;
    const qtyInCart = cart[productId] || 0;
    const isGranel = product.category === 'granel';
    const actionsContainer = card.querySelector('.card-actions');
    if (!actionsContainer) return;

    if (qtyInCart > 0) {
        actionsContainer.innerHTML = `
            <div class="card-qty-selector ${isGranel ? 'granel-qty-selector' : ''}" id="qty-selector-${product.id}">
                <button class="card-qty-btn minus" onclick="updateCartQty('${product.id}', -1, event)" title="Diminuir quantidade" aria-label="Diminuir quantidade">−</button>
                <span class="card-qty-display">
                    <span class="card-qty-val">${qtyInCart}</span>
                    <span class="card-qty-label">${isGranel ? 'pct no cesto' : 'no cesto'}</span>
                </span>
                <button class="card-qty-btn plus" onclick="updateCartQty('${product.id}', 1, event)" title="Aumentar quantidade" aria-label="Aumentar quantidade">+</button>
            </div>
        `;
    } else {
        actionsContainer.innerHTML = `
            <button class="btn-add-cart ${isGranel ? 'btn-add-cart-granel' : ''}" id="btn-add-${product.id}" onclick="addToCart('${product.id}', event)">
                <span class="btn-cart-icon">🛒</span>
                <span class="btn-cart-text">${isGranel ? 'Adicionar Pacote ao Cesto' : 'Adicionar ao Cesto'}</span>
            </button>
        `;
    }
}

// --- CONTROLE DE CARRINHO & PERSISTÊNCIA ---
function addToCart(productId, event) {
    if (event) event.stopPropagation();
    cart[productId] = (cart[productId] || 0) + 1;
    saveCart();
    
    updateCartUI();
    updateCardActionUI(productId);
    showToast("✓ Adicionado ao cesto de compras!");
}

function updateCartQty(productId, delta, event) {
    if (event) event.stopPropagation();
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

function renderCartDrawerItems() {
    const container = document.getElementById("cart-items-list");
    const totalEl = document.getElementById("drawer-total-price");
    if (!container) return;

    const { totalCount, totalPrice } = getCartStats();

    if (totalCount === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                <p style="font-size: 32px; margin-bottom: 8px;">🛒</p>
                <p>Seu cesto está vazio.</p>
            </div>
        `;
        if (totalEl) totalEl.textContent = "R$ 0,00";
        return;
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
                        <button class="qty-btn" onclick="updateCartQty('${product.id}', -1)">-</button>
                        <span class="qty-display">${qty}</span>
                        <button class="qty-btn" onclick="updateCartQty('${product.id}', 1)">+</button>
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
        showToast("Seu cesto está vazio!");
        return;
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
💳 *Pretendo Pagar com:* ${paymentMethod}

👤 *Consultor(a) Atendente:* ${currentSeller.name} (${currentSeller.tag})
📱 *Origem:* Catálogo Digital Agro Salinas

Poderia me confirmar a disponibilidade e o prazo de entrega? Obrigado!`;

    const whatsappUrl = `https://wa.me/${targetWhatsapp}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
}

function quickBuyWhatsApp(productId) {
    const product = PRODUCTS.find(p => p.id.toString() === productId.toString());
    if (!product) return;

    const targetWhatsapp = currentSeller.whatsapp || (typeof VENDAS_CONFIG !== 'undefined' ? VENDAS_CONFIG.lojaWhatsApp : STORE_CONFIG.whatsappNumber);
    const isGranel = product.category === 'granel';
    const prodTitle = toTitleCase(product.name);

    let message = "";
    if (isGranel) {
        const packBadge = product.badge || `Pacote ${product.unit || 'Kg'}`;
        const extraInfo = product.extraInfo ? ` (${product.extraInfo})` : '';
        message = 
`*👋 Olá, ${currentSeller.name}!*
Tenho interesse neste produto a granel do catálogo Agro Salinas:

⚖️ *[CÓD ${product.code}] ${prodTitle}*
📦 *Embalagem:* ${packBadge} Fechado e Selado${extraInfo}
💰 *Preço:* R$ ${product.price.toFixed(2).replace('.', ',')}

🏷️ *Consultor(a):* ${currentSeller.name} (${currentSeller.tag})`;
    } else {
        message = 
`*👋 Olá, ${currentSeller.name}!*
Tenho interesse no seguinte produto do catálogo Agro Salinas:

📦 *[CÓD ${product.code}] ${prodTitle}*
💰 *Preço:* R$ ${product.price.toFixed(2).replace('.', ',')} / ${product.unit || 'un'}

🏷️ *Consultor(a):* ${currentSeller.name} (${currentSeller.tag})`;
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
        showToast("Salvo nos favoritos! ❤️");
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
            cardFavBtn.innerHTML = isFav ? '❤️' : '🤍';
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
