// --- ESTADO GLOBAL & PERSISTÊNCIA ---
let currentCategory = "todos";
let currentSubcategory = "todas";
let currentSort = "price_asc";
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

let selectedVariants = {};

// Ícone SVG nítido e profissional de carrinho de supermercado
const CART_ICON_SVG = `<svg class="btn-svg-cart" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><circle cx="9" cy="21" r="1.2"></circle><circle cx="19" cy="21" r="1.2"></circle><path d="M1 1h4l2.6 12.8a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L23 6H6"></path></svg>`;

// Ícone SVG nítido e profissional de compartilhamento (Web Share)
const SHARE_ICON_SVG = `<svg class="btn-svg-share" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>`;

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

// Recupera a variação selecionada para um produto (ou a primeira padrão)
function getProductActiveVariant(product) {
    if (!product || !product.variations || product.variations.length === 0) return null;
    const selectedLabel = selectedVariants[product.id];
    if (selectedLabel) {
        const found = product.variations.find(v => v.label === selectedLabel);
        if (found) return found;
    }
    return product.variations[0];
}

// Chave única para o item no carrinho (suporta variação, ex: "342__Vermelha")
function getActiveCartKey(productId) {
    const product = PRODUCTS.find(p => p.id.toString() === productId.toString());
    if (!product) return productId.toString();
    const variant = getProductActiveVariant(product);
    if (variant) {
        return `${product.id}__${variant.label}`;
    }
    return product.id.toString();
}

// Extrai informações do item a partir da chave do carrinho (ex: "342__Vermelha" ou "58")
function getCartItemInfo(cartKey) {
    if (!cartKey) return null;
    let baseId = cartKey.toString();
    let variantLabel = null;
    if (baseId.includes("__")) {
        const parts = baseId.split("__");
        baseId = parts[0];
        variantLabel = parts[1];
    }
    const baseProduct = PRODUCTS.find(p => p.id.toString() === baseId.toString());
    if (!baseProduct) return null;

    let product = { ...baseProduct };
    let variant = null;

    if (variantLabel && baseProduct.variations) {
        variant = baseProduct.variations.find(v => v.label === variantLabel || v.code === variantLabel);
        if (variant) {
            if (variant.code) product.code = variant.code;
            if (variant.price) product.price = variant.price;
            if (variant.image) product.image = variant.image;
            product.variantLabel = variant.label;
        }
    }
    return { product, variant, baseProduct, cartKey };
}

// Seleciona a variação (cor/tamanho) do produto no card ou modal
function selectProductVariant(productId, variantLabel, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const product = PRODUCTS.find(p => p.id.toString() === productId.toString());
    if (!product || !product.variations) return;
    const variant = product.variations.find(v => v.label === variantLabel);
    if (!variant) return;

    selectedVariants[productId] = variantLabel;

    // Atualiza Card no catálogo se existir na tela
    const card = document.getElementById(`card-${productId}`);
    if (card) {
        card.querySelectorAll('.variant-pill-btn').forEach(btn => {
            if (btn.dataset.variant === variantLabel) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        const labelEl = card.querySelector('.variants-selected-val');
        if (labelEl) labelEl.textContent = variant.label;

        if (variant.price) {
            const priceValEl = card.querySelector('.price-value');
            if (priceValEl) priceValEl.textContent = `R$ ${variant.price.toFixed(2).replace('.', ',')}`;
        }
        if (variant.code) {
            const codeEl = card.querySelector('.meta-code');
            if (codeEl) codeEl.textContent = `Cód: ${variant.code}`;
        }
        if (variant.image) {
            const imgEl = card.querySelector('.product-img') || card.querySelector('.product-image');
            if (imgEl) imgEl.src = variant.image;
        }
        updateCardActionUI(productId);
    }

    // Atualiza Modal QuickView se estiver aberto para este produto
    const qvModal = document.getElementById('quickview-modal');
    if (qvModal && qvModal.classList.contains('active')) {
        const qvCode = qvModal.querySelector('.quickview-code-tag');
        if (qvCode && variant.code) qvCode.textContent = `CÓD ${variant.code}`;

        const qvPrice = qvModal.querySelector('.quickview-price-val');
        if (qvPrice && variant.price) qvPrice.textContent = variant.price.toFixed(2).replace('.', ',');

        const qvSelectedLabel = qvModal.querySelector('.qv-variant-selected-val');
        if (qvSelectedLabel) qvSelectedLabel.textContent = variant.label;

        qvModal.querySelectorAll('.variant-pill-btn').forEach(btn => {
            if (btn.dataset.variant === variantLabel) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        if (variant.image) {
            const qvImg = qvModal.querySelector('.quickview-img') || qvModal.querySelector('.quickview-image');
            if (qvImg) {
                qvImg.src = variant.image;
                qvImg.style.display = 'block';
            }
        }

        refreshQuickViewActions(productId);
    }
}

// Catálogo mestre: exibe os produtos e controla itens disponíveis
function getCatalogProducts() {
    let prods = PRODUCTS.filter(p => !p.grouped && !p.isVariantOf);
    if (typeof STORE_CONFIG !== 'undefined' && STORE_CONFIG.hideWithoutImage) {
        return prods.filter(p => !!p.image && typeof p.image === 'string' && p.image.trim() !== '');
    }
    return prods;
}

// Verifica se o item pode ser escolhido/comprado no site
// Itens sem foto exibem o placeholder da categoria e estão 100% liberados para compra
function isProductAvailable(product) {
    if (!product) return false;
    if (product.outOfStock || product.available === false || product.paused) return false;
    if (typeof product.stock === 'number' && product.stock <= 0) return false;
    if (typeof STORE_CONFIG !== 'undefined' && STORE_CONFIG.requireImageForPurchase === true) {
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

// Gerador de Placeholders Visuais Elegantes e Padronizados por Categoria
function getCategoryPlaceholderSvg(category, catName) {
    const cleanCat = (category || "").toLowerCase();
    const cleanLabel = catName || "Agro Salinas";

    if (cleanCat === "caes" || cleanCat.includes("cao") || cleanCat.includes("cão")) {
        return `
            <div class="product-placeholder-box placeholder-caes">
                <svg class="placeholder-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="15" r="4" fill="currentColor" fill-opacity="0.12"/>
                    <circle cx="6.5" cy="10" r="2.2" fill="currentColor" fill-opacity="0.12"/>
                    <circle cx="10" cy="6" r="2.2" fill="currentColor" fill-opacity="0.12"/>
                    <circle cx="14" cy="6" r="2.2" fill="currentColor" fill-opacity="0.12"/>
                    <circle cx="17.5" cy="10" r="2.2" fill="currentColor" fill-opacity="0.12"/>
                </svg>
                <span class="product-placeholder-tag">🐶 ${cleanLabel}</span>
            </div>
        `;
    }

    if (cleanCat === "gatos" || cleanCat.includes("cat") || cleanCat.includes("felino")) {
        return `
            <div class="product-placeholder-box placeholder-gatos">
                <svg class="placeholder-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 6 L7 12 C8.5 11.5 10.2 11.2 12 11.2 C13.8 11.2 15.5 11.5 17 12 L20 6 L18 16 C17 19.5 14.5 21 12 21 C9.5 21 7 19.5 6 16 Z" fill="currentColor" fill-opacity="0.1"/>
                    <circle cx="9" cy="14.5" r="1.2" fill="currentColor"/>
                    <circle cx="15" cy="14.5" r="1.2" fill="currentColor"/>
                    <path d="M11 17 L12 18 L13 17" stroke-width="1.5"/>
                </svg>
                <span class="product-placeholder-tag">🐱 ${cleanLabel}</span>
            </div>
        `;
    }

    if (cleanCat === "farmacia" || cleanCat.includes("medic") || cleanCat.includes("vet")) {
        return `
            <div class="product-placeholder-box placeholder-farmacia">
                <svg class="placeholder-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="currentColor" fill-opacity="0.08"/>
                    <line x1="12" y1="8" x2="12" y2="16" stroke-width="2.5"/>
                    <line x1="8" y1="12" x2="16" y2="12" stroke-width="2.5"/>
                </svg>
                <span class="product-placeholder-tag">💊 ${cleanLabel}</span>
            </div>
        `;
    }

    if (cleanCat === "granel") {
        return `
            <div class="product-placeholder-box placeholder-granel">
                <svg class="placeholder-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 3v18M6 8l6-2 6 2M6 8L3 14c0 1.5 1.5 2 3 2s3-.5 3-2L6 8zM18 8l-3 6c0 1.5 1.5 2 3 2s3-.5 3-2l-3-6zM4 21h16" fill="currentColor" fill-opacity="0.08"/>
                </svg>
                <span class="product-placeholder-tag">⚖️ ${cleanLabel}</span>
            </div>
        `;
    }

    if (cleanCat === "passaros_roedores" || cleanCat.includes("passaro") || cleanCat.includes("ave") || cleanCat.includes("roedor")) {
        return `
            <div class="product-placeholder-box placeholder-passaros">
                <svg class="placeholder-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 18c6 0 10-3 12-8 2-5 6-7 6-7s-3 4-3 7c0 4-3 8-7 9-3 1-6 0-8-1z" fill="currentColor" fill-opacity="0.1"/>
                    <path d="M13 10c-3 1-5 3-6 6"/>
                </svg>
                <span class="product-placeholder-tag">🦜 ${cleanLabel}</span>
            </div>
        `;
    }

    if (cleanCat === "pesca" || cleanCat.includes("peixe") || cleanCat.includes("camping")) {
        return `
            <div class="product-placeholder-box placeholder-pesca">
                <svg class="placeholder-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 16s9-14 20-3c-4 3-7 4-11 4-3.5 0-6-1-9-1z" fill="currentColor" fill-opacity="0.1"/>
                    <path d="M2 16l4-5m-4 5l4 5"/>
                    <circle cx="18" cy="11" r="1.2" fill="currentColor"/>
                </svg>
                <span class="product-placeholder-tag">🎣 ${cleanLabel}</span>
            </div>
        `;
    }

    return `
        <div class="product-placeholder-box placeholder-default">
            <svg class="placeholder-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 3h12l2 4v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7l2-4z" fill="currentColor" fill-opacity="0.08"/>
                <line x1="4" y1="7" x2="20" y2="7"/>
                <path d="M9 12h6"/>
                <path d="M9 16h4"/>
            </svg>
            <span class="product-placeholder-tag">📦 ${cleanLabel}</span>
        </div>
    `;
}

function handleImageError(imgEl, category, catName) {
    if (!imgEl || !imgEl.parentElement) return;
    imgEl.parentElement.innerHTML = getCategoryPlaceholderSvg(category, catName);
}

// --- INICIALIZAÇÃO ---
document.addEventListener("DOMContentLoaded", () => {
    initSeller();
    renderDepartmentsShelf();
    renderCategories();
    renderSubcategories();
    renderProducts();
    setupEventListeners();
    updateCartUI();
    updateFavoritesUI();
    syncProductsFromSupabase();
    handleDirectProductUrl();
    handleDirectCartUrl();
    updateTopbarHoursUI();
    setInterval(updateTopbarHoursUI, 60000);
});

// --- SINCRONIZAÇÃO EM TEMPO REAL DE ESTOQUE E PREÇOS COM O SUPABASE ---
async function syncProductsFromSupabase() {
    try {
        if (typeof SUPABASE_CONFIG === 'undefined' || !SUPABASE_CONFIG.url || !Array.isArray(PRODUCTS)) return;
        const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/produtos?select=*&_t=${Date.now()}`, {
            cache: 'no-store',
            headers: {
                'apikey': SUPABASE_CONFIG.anonKey,
                'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
            }
        });
        if (!res.ok) return;
        const dbProducts = await res.json();
        if (!Array.isArray(dbProducts) || dbProducts.length === 0) return;

        let hasChanges = false;
        dbProducts.forEach(dbP => {
            const local = PRODUCTS.find(p => p.id.toString() === dbP.id.toString());
            if (local) {
                const newPrice = Number(dbP.price);
                let newAvail = dbP.available !== false;
                let newOutOfStock = Boolean(dbP.out_of_stock);
                let newBadge = dbP.badge !== null && dbP.badge !== undefined ? dbP.badge : local.badge;

                // Suporte à quantidade numérica de estoque
                let newStock = undefined;
                if (typeof dbP.stock !== 'undefined' && dbP.stock !== null && dbP.stock !== '') {
                    newStock = Number(dbP.stock);
                } else if (dbP.raw_data && typeof dbP.raw_data.stock !== 'undefined' && dbP.raw_data.stock !== null) {
                    newStock = Number(dbP.raw_data.stock);
                }

                // Se o estoque numérico for 0, marca automaticamente como esgotado
                if (typeof newStock === 'number' && newStock <= 0) {
                    newOutOfStock = true;
                    newAvail = false;
                } else if (typeof newStock === 'number' && newStock > 0) {
                    newOutOfStock = false;
                    newAvail = true;
                    if (newStock <= 3 && (!newBadge || newBadge === 'Destaque' || newBadge.startsWith('Apenas'))) {
                        newBadge = `Apenas ${newStock} un`;
                    }
                }

                if (
                    local.price !== newPrice ||
                    local.available !== newAvail ||
                    local.outOfStock !== newOutOfStock ||
                    (newBadge !== local.badge) ||
                    (typeof newStock !== 'undefined' && local.stock !== newStock)
                ) {
                    local.price = newPrice;
                    local.available = newAvail;
                    local.outOfStock = newOutOfStock;
                    local.badge = newBadge;
                    if (typeof newStock !== 'undefined') local.stock = newStock;
                    hasChanges = true;
                }
            }
        });

        if (hasChanges) {
            renderProducts();
            updateCartUI();
        }
    } catch (err) {
        console.warn('Sincronização em segundo plano não disponível:', err);
    }
}

// --- SISTEMA MULTI-VENDEDOR SEGURO (PROTEÇÃO DE COMISSÃO) ---
let isLinkExpiredGlobal = false;
let currentLinkValidation = null;

// --- SISTEMA MULTI-VENDEDOR SEGURO COM VALIDADE DE 30 DIAS ---
function initSeller() {
    const urlParams = new URLSearchParams(window.location.search);
    const sellerParam = urlParams.get("v") || urlParams.get("vendedor") || urlParams.get("ref");
    const timeParam = urlParams.get("t") || urlParams.get("token") || urlParams.get("d");

    // Vendedor padrão caso não haja indicação (Loja Oficial: William & Meiri)
    const fallbackSeller = (typeof VENDAS_CONFIG !== 'undefined' && VENDAS_CONFIG.defaultVendedor) 
        ? VENDAS_CONFIG.defaultVendedor 
        : { code: "LOJA", name: "William & Meiri (Loja)", whatsapp: "5551995624230" };

    if (sellerParam) {
        const inputCode = decodeURIComponent(sellerParam).trim().toUpperCase();
        
        // Valida se o vendedor existe no cadastro oficial
        let matched = null;
        if (typeof findVendedorByCode === 'function') {
            matched = findVendedorByCode(inputCode);
        } else if (typeof VENDEDORES !== 'undefined') {
            matched = VENDEDORES.find(v => v.code === inputCode && v.active !== false);
        }

        if (matched) {
            const isStore = ['ADMIN', 'LOJA', 'WILLIAM', 'MEIRI', 'MEIRE', 'AGROSALINAS', 'LOJAOFICIAL', 'STORE'].includes(matched.code.toUpperCase());
            currentSeller = {
                code: isStore ? "LOJA" : matched.code,
                name: isStore ? "William & Meiri (Loja)" : matched.name,
                tag: isStore ? "#LOJA-OFICIAL" : (matched.tag || `#${matched.code}`),
                whatsapp: isStore ? "5551995624230" : matched.whatsapp
            };
            // Salva na sessão do cliente para ele não perder o vendedor enquanto navega
            localStorage.setItem("agro_salinas_seller_code", currentSeller.code);
        } else {
            // Código desconhecido: usa atendimento oficial da loja
            currentSeller = {
                code: fallbackSeller.code,
                name: fallbackSeller.name,
                tag: "#LOJA-OFICIAL",
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
                matched = VENDEDORES.find(v => v.code === savedCode && v.active !== false);
            }
        }

        if (matched) {
            const isStore = ['ADMIN', 'LOJA', 'WILLIAM', 'MEIRI', 'MEIRE', 'AGROSALINAS', 'LOJAOFICIAL', 'STORE'].includes(matched.code.toUpperCase());
            currentSeller = {
                code: isStore ? "LOJA" : matched.code,
                name: isStore ? "William & Meiri (Loja)" : matched.name,
                tag: isStore ? "#LOJA-OFICIAL" : (matched.tag || `#${matched.code}`),
                whatsapp: isStore ? "5551995624230" : matched.whatsapp
            };
        } else {
            currentSeller = {
                code: fallbackSeller.code,
                name: fallbackSeller.name,
                tag: "#LOJA-OFICIAL",
                whatsapp: fallbackSeller.whatsapp
            };
        }
    }

    const isStoreGlobal = currentSeller && ['ADMIN', 'LOJA', 'WILLIAM', 'MEIRI', 'MEIRE', 'AGROSALINAS', 'LOJAOFICIAL', 'STORE'].includes((currentSeller.code || '').toUpperCase());

    // --- VERIFICAÇÃO DE VALIDADE DO LINK (DURAÇÃO MÁXIMA DE 30 DIAS) ---
    // Links oficiais da Loja (William & Meiri) são fixos e permanentes, nunca expiram
    let validation = { valid: true, expired: false, remainingDays: 365 };
    if (!isStoreGlobal) {
        const savedLinkCreatedAt = localStorage.getItem("agro_salinas_link_time");
        if (typeof validateSellerLink === "function") {
            validation = validateSellerLink(timeParam, savedLinkCreatedAt);
        }
    }
    currentLinkValidation = validation;

    // Se o link completou os 30 dias (apenas para links temporários de vendedores externos):
    if (!isStoreGlobal && validation.expired) {
        isLinkExpiredGlobal = true;
        showLinkExpiredScreen(currentSeller, validation);
        return;
    }

    // Se o link estiver válido, salva o início da contagem no dispositivo
    if (validation.createdAt) {
        localStorage.setItem("agro_salinas_link_time", validation.createdAt.getTime().toString());
    }

    // Atualizar UI do Banner (se visível)
    const bannerEl = document.getElementById("seller-banner");
    const sellerInfoEl = document.getElementById("seller-info-content");
    if (bannerEl && currentSeller && currentSeller.code) {
        const infoHtml = isStoreGlobal ? `
            <span style="font-size: 15px;">🏪</span>
            <div>
                <span>Atendimento Direto: <strong id="seller-name">Agro Salinas</strong></span>
            </div>
        ` : `
            <span style="font-size: 15px;">🧑‍💼</span>
            <div>
                <span>Seu Consultor(a): <strong id="seller-name">${currentSeller.name}</strong></span>
                <span class="seller-badge" id="seller-tag">#${currentSeller.code}</span>
            </div>
        `;
        if (sellerInfoEl) {
            sellerInfoEl.innerHTML = infoHtml;
        } else {
            bannerEl.innerHTML = `<div class="seller-info" id="seller-info-content">${infoHtml}</div>`;
        }
        bannerEl.style.display = "flex";
    }
}

// --- TELA DE LINK EXPIRADO (ENCAMINHA CLIENTE PARA O WHATSAPP DA AGROPECUÁRIA) ---
function showLinkExpiredScreen(seller, validation) {
    // 1. Oculta os elementos da loja para que o cliente não veja o catálogo vencido
    const hideSelectors = [
        ".sticky-nav-wrapper",
        "#seller-banner",
        ".products-section",
        "#floating-cart-bar",
        "#cart-drawer",
        "#cart-backdrop",
        "#sidebar-drawer",
        "#sidebar-overlay",
        ".filters-container"
    ];
    hideSelectors.forEach(sel => {
        const els = document.querySelectorAll(sel);
        els.forEach(el => el.style.display = "none");
    });

    document.body.style.overflow = "auto";

    // 2. Prepara contatos de WhatsApp
    const lojaZap = (typeof VENDAS_CONFIG !== 'undefined' && VENDAS_CONFIG.lojaWhatsApp) || "5551995624230";
    const sellerName = (seller && seller.name) ? seller.name : "Agro Salinas";
    const sellerCode = (seller && seller.code) ? seller.code : "LOJA";

    const msgLoja = `Olá! Acessei o catálogo da Agro Salinas, mas o meu link de 30 dias expirou (consultor: ${sellerName} #${sellerCode}). Gostaria de receber um novo link atualizado de compras, por favor!`;
    const lojaUrl = `https://wa.me/${lojaZap}?text=${encodeURIComponent(msgLoja)}`;

    let vendedorUrl = "";
    if (seller && seller.whatsapp && seller.whatsapp !== lojaZap) {
        const msgVendedor = `Olá ${sellerName}! O link do catálogo da Agro Salinas que você me enviou completou os 30 dias de validade. Poderia me mandar um novo link atualizado, por favor?`;
        vendedorUrl = `https://wa.me/${seller.whatsapp}?text=${encodeURIComponent(msgVendedor)}`;
    }

    // 3. Injeta a tela de bloqueio
    let screen = document.getElementById("link-expired-screen");
    if (!screen) {
        screen = document.createElement("div");
        screen.id = "link-expired-screen";
        screen.className = "link-expired-screen";
        document.body.prepend(screen);
    }

    screen.innerHTML = `
        <div class="expired-card">
            <div class="expired-badge">
                <span class="expired-badge-icon">⏳</span>
                <span>Validade de 30 Dias Encerrada</span>
            </div>
            <img src="assets/logo.png" alt="Agro Salinas" class="expired-logo" onerror="this.style.display='none'">
            <h1 class="expired-title">Este link de atendimento expirou</h1>
            <p class="expired-desc">
                Para sua segurança e comodidade, os links de atendimento têm duração máxima de <strong>30 dias</strong> para garantir que você sempre consulte os <strong>preços, estoque e promoções em vigor</strong>.
            </p>

            <div class="expired-seller-box">
                <span class="expired-seller-sub">Atendimento anterior vinculado a:</span>
                <span class="expired-seller-title">🧑‍💼 ${sellerName} <span class="expired-seller-tag">#${sellerCode}</span></span>
            </div>

            <div class="expired-actions">
                <a href="${lojaUrl}" class="btn-expired-primary" target="_blank" rel="noopener noreferrer">
                    <span class="btn-expired-icon">💬</span>
                    <span class="btn-expired-content">
                        <strong>Chamar Agro Salinas no WhatsApp</strong>
                        <small>Solicitar novo link oficial agora</small>
                    </span>
                </a>

                ${vendedorUrl ? `
                <a href="${vendedorUrl}" class="btn-expired-secondary" target="_blank" rel="noopener noreferrer">
                    <span class="btn-expired-icon">🧑‍💼</span>
                    <span class="btn-expired-content">
                        <strong>Falar com o consultor ${sellerName}</strong>
                        <small>Pedir novo link para o seu vendedor</small>
                    </span>
                </a>` : ''}
            </div>

            <p class="expired-note">
                Ao clicar no botão verde, uma mensagem será aberta automaticamente no seu WhatsApp para a equipe da Agro Salinas te enviar um novo link em instantes!
            </p>
        </div>
    `;
    screen.style.display = "flex";
}

// --- RENDERIZAÇÃO DA PRATELEIRA DE DEPARTAMENTOS (CARDS RETANGULARES NA HOME) ---
function renderDepartmentsShelf() {
    const shelfGrid = document.getElementById("departments-grid");
    if (!shelfGrid) return;

    const activeList = getCatalogProducts();
    const depts = CATEGORIES.filter(c => c.id !== "todos");

    shelfGrid.innerHTML = depts.map(dept => {
        const count = activeList.filter(p => {
            if (p.category !== dept.id) return false;
            if (dept.id === "granel" && (!p.image || !p.image.startsWith("assets/granel/"))) return false;
            return true;
        }).length;

        const tagsHtml = (dept.tags || []).map(t => `<span class="dept-card-tag">${t}</span>`).join("");

        return `
            <div class="department-card" data-cat="${dept.id}" onclick="selectCategory('${dept.id}')" role="button" tabindex="0">
                <div class="dept-card-illustration">
                    <img src="${dept.illustration}" alt="${dept.name}" loading="lazy">
                </div>
                <div class="dept-card-content">
                    <div class="dept-card-header">
                        <h3 class="dept-card-title">${dept.name}</h3>
                        <span class="dept-card-count">${count} itens</span>
                    </div>
                    <p class="dept-card-desc">${dept.subtitle || ''}</p>
                    <div class="dept-card-tags">
                        ${tagsHtml}
                    </div>
                </div>
                <div class="dept-card-arrow" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                </div>
            </div>
        `;
    }).join("");
}

// Ícones vetoriais de categorias limpos e modernos (Anti-slop / Taste Skill)
const CATEGORY_SVGS = {
    todos: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
    gatos: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><path d="M12 5c-3.87 0-7 3.13-7 7 0 2.21 1.02 4.18 2.61 5.46L7 21l3.5-1.5c.48.13.98.2 1.5.2s1.02-.07 1.5-.2L17 21l-.61-3.54C17.98 16.18 19 14.21 19 12c0-3.87-3.13-7-7-7z"></path><circle cx="9" cy="11" r="1"></circle><circle cx="15" cy="11" r="1"></circle><path d="M10 15c.5.5 1.5.5 2 0"></path><path d="M7 6L4 2l1 5"></path><path d="M17 6l3-4-1 5"></path></svg>`,
    caes: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><path d="M10 5.172C10 3.782 8.423 2.679 6.5 3c-2.823.47-4.113 6.006-4 7 .08.703 1.725 1.722 3.5 1 1.695-.69 4-3.146 4-5.828z"></path><path d="M14 5.172C14 3.782 15.577 2.679 17.5 3c2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.5 1-1.695-.69-4-3.146-4-5.828z"></path><path d="M8 14v.5"></path><path d="M16 14v.5"></path><path d="M11.25 16.25h1.5"></path><path d="M4.5 10c0 4.142 3.358 7.5 7.5 7.5s7.5-3.358 7.5-7.5-3.358-6.5-7.5-6.5-7.5 2.358-7.5 6.5z"></path></svg>`,
    granel: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><path d="M6 3h12l2 6H4l2-6z"></path><path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"></path><line x1="10" y1="14" x2="14" y2="14"></line></svg>`,
    farmacia: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"></path><path d="m8.5 8.5 7 7"></path></svg>`,
    passaros_roedores: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><path d="M16 7h.01"></path><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 14"></path><path d="m20 7 2 .5-2 .5"></path><path d="M10 18v3"></path><path d="M14 17.75V21"></path><path d="M7 18a6 6 0 0 0 3.84-10.61"></path></svg>`,
    jardim_agro: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><path d="M12 22v-9"></path><path d="M9 13a5 5 0 0 1 5-5c1.66 0 3 1.34 3 3a5 5 0 0 1-5 5h-3z"></path><path d="M15 9a5 5 0 0 0-5-5c-1.66 0-3 1.34-3 3a5 5 0 0 0 5 5h3z"></path></svg>`,
    pesca: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><path d="M6.5 12c.94-2.07 2.84-3.5 5.5-3.5 4.42 0 8 3.58 8 8 0 1.25-.29 2.43-.8 3.5"></path><path d="M18 12a6 6 0 0 0-6-6c-2.33 0-4.37 1.34-5.37 3.3"></path><circle cx="16" cy="16" r="2"></circle><path d="m2 2 20 20"></path></svg>`
};

// --- RENDERIZAÇÃO DAS CATEGORIAS PRINCIPAIS (DESKTOP & SIDEBAR) ---
function renderCategories() {
    const desktopContainer = document.getElementById("categories-list");
    const sidebarContainer = document.getElementById("sidebar-categories-list");

    // HTML Desktop (Pills horizontais em fileira única)
    if (desktopContainer) {
        desktopContainer.innerHTML = CATEGORIES.map(cat => `
            <button class="category-pill ${cat.id === currentCategory ? 'active' : ''}" data-cat="${cat.id}">
                <span class="cat-icon">${CATEGORY_SVGS[cat.id] || ''}</span>
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
                        <span class="cat-icon">${CATEGORY_SVGS[cat.id] || ''}</span>
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

    // Sincronizar classes ativas nos pills e sidebar
    document.querySelectorAll(".category-pill").forEach(p => {
        p.classList.toggle("active", p.getAttribute("data-cat") === catId);
    });
    document.querySelectorAll(".sidebar-cat-btn").forEach(p => {
        p.classList.toggle("active", p.getAttribute("data-cat") === catId);
    });

    const isHome = (catId === "todos" && !searchQuery);
    document.body.classList.toggle("home-view", isHome);

    const shelfSection = document.getElementById("departments-shelf-section");
    const activeDeptBanner = document.getElementById("active-dept-banner");
    const sectionTitle = document.getElementById("section-title");

    if (catId === "todos") {
        if (shelfSection) shelfSection.style.display = searchQuery ? "none" : "block";
        if (activeDeptBanner) activeDeptBanner.style.display = "none";
        if (sectionTitle) sectionTitle.textContent = searchQuery ? `Resultados da busca por "${searchQuery}"` : "Todos os Produtos da Agro Salinas";
    } else {
        if (shelfSection) shelfSection.style.display = "none";
        if (activeDeptBanner) {
            activeDeptBanner.style.display = "flex";
            const deptObj = CATEGORIES.find(c => c.id === catId);
            const titleEl = document.getElementById("active-dept-title");
            const iconImg = document.getElementById("active-dept-icon-img");

            if (deptObj) {
                if (titleEl) titleEl.textContent = deptObj.name;
                if (iconImg) {
                    iconImg.src = deptObj.illustration;
                    iconImg.alt = deptObj.name;
                    iconImg.style.display = deptObj.illustration ? "block" : "none";
                }
            }
            if (sectionTitle && deptObj) {
                sectionTitle.textContent = `Prateleira: ${deptObj.name}`;
            }
        }
    }

    renderSubcategories();
    renderProducts();

    // Scroll suave para o topo ao selecionar um departamento (exibe o banner completo sem cortes)
    if (catId !== "todos") {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
}

// --- RENDERIZAÇÃO DAS SUBCATEGORIAS DINÂMICAS NA PRATELEIRA & SIDEBAR ---
function renderSubcategories() {
    const chipsContainer = document.getElementById("dept-quick-chips");
    const blockEl = document.getElementById("dept-subcategories-block");
    const sidebarSection = document.getElementById("sidebar-subcategories-section");
    const sidebarList = document.getElementById("sidebar-subcategories-list");
    const sidebarTitle = document.getElementById("sidebar-subcategories-title");

    if (currentCategory === "todos") {
        if (chipsContainer) chipsContainer.innerHTML = "";
        if (blockEl) blockEl.style.display = "none";
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

    // Ordem de prioridade comercial (Rações e Sachês primeiro conforme hábitos dos clientes)
    const SUBCATEGORY_PRIORITY = {
        gatos: [
            'Patês & Sachês',
            'Rações Secas',
            'Areias Sanitárias',
            'Arranhadores',
            'Bandejas & Higiene',
            'Brinquedos',
            'Comedouros & Bebedouros',
            'Fontes & Bebedouros'
        ],
        caes: [
            'Rações Secas',
            'Patês & Sachês',
            'Petiscos & Cookies',
            'Nutrição Clínica',
            'Higiene & Beleza',
            'Comedouros & Bebedouros',
            'Passeio & Guias',
            'Brinquedos',
            'Casinhas & Camas',
            'Transporte'
        ],
        granel: [
            'Rações para Cães',
            'Rações para Gatos',
            'Pássaros & Outros'
        ],
        farmacia: [
            'Antipulgas & Carrapatos',
            'Vermífugos',
            'Higiene & Cuidados',
            'Vitaminas & Suplementos',
            'Dermatológicos & Alívio'
        ]
    };

    const priorityList = SUBCATEGORY_PRIORITY[currentCategory] || [];
    subcats.sort((a, b) => {
        const indexA = priorityList.indexOf(a);
        const indexB = priorityList.indexOf(b);
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b);
    });

    if (subcats.length <= 1) {
        if (chipsContainer) {
            chipsContainer.innerHTML = "";
        }
        if (blockEl) blockEl.style.display = "none";
        if (sidebarSection) sidebarSection.style.display = "none";
        if (sidebarList) sidebarList.innerHTML = "";
        return;
    }

    // Exibir o bloco de subcategorias e atualizar os chips em grade
    if (blockEl) blockEl.style.display = "flex";
    if (chipsContainer) {
        chipsContainer.style.display = "grid";
        let chipsHtml = `
            <button class="dept-quick-chip ${currentSubcategory === 'todas' ? 'active' : ''}" data-subcat="todas">
                Ver Todos em ${catShortName}
            </button>
        `;
        subcats.forEach(sub => {
            chipsHtml += `
                <button class="dept-quick-chip ${currentSubcategory === sub ? 'active' : ''}" data-subcat="${sub}">
                    ${sub}
                </button>
            `;
        });
        chipsContainer.innerHTML = chipsHtml;
        chipsContainer.querySelectorAll(".dept-quick-chip").forEach(btn => {
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
                <span style="font-size: 12px; opacity: 0.7;">(${categoryProducts.length})</span>
            </button>
        `;
        subcats.forEach(sub => {
            const subCount = categoryProducts.filter(p => p.subcategory === sub).length;
            sidebarHtml += `
                <button class="sidebar-subcat-btn ${currentSubcategory === sub ? 'active' : ''}" data-subcat="${sub}">
                    <span>${sub}</span>
                    <span style="font-size: 12px; opacity: 0.7;">(${subCount})</span>
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

    // Sincronizar classes ativas nos chips do banner e no drawer lateral
    document.querySelectorAll(".dept-quick-chip").forEach(p => {
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
    const activeVar = getProductActiveVariant(product);
    const cartKey = getActiveCartKey(product.id);
    const qtyInCart = cart[cartKey] || 0;
    const isFav = favorites.includes(product.id.toString());
    const catName = CATEGORIES.find(c => c.id === product.category)?.name.split(' ')[0] || 'Agro';
    const isGranel = product.category === 'granel';
    const productName = toTitleCase(product.name);
    const displayCode = activeVar && activeVar.code ? activeVar.code : product.code;
    const displayPrice = activeVar && activeVar.price ? activeVar.price : product.price;
    const displayImage = activeVar && activeVar.image ? activeVar.image : product.image;

    const placeholderSvg = getCategoryPlaceholderSvg(product.category, catName);

    const imageHtml = displayImage ? `
        <div class="product-image-container" onclick="openQuickView('${product.id}')" title="Clique para ver detalhes rápidos do produto">
            <img src="${displayImage}" alt="${productName}" class="product-img" loading="lazy" decoding="async" onerror="handleImageError(this, '${product.category}', '${catName}')">
        </div>
    ` : `
        <div class="product-image-container" onclick="openQuickView('${product.id}')" title="Clique para ver detalhes rápidos do produto">
            ${placeholderSvg}
        </div>
    `;

    const isAvailable = isProductAvailable(product);
    const isEsgotado = product.outOfStock || product.available === false;
    const isAllcanis = (product.name && product.name.toLowerCase().includes('allcanis')) || !!product.graoMacio;
    let badgeHtml = '';
    if (!isAvailable) {
        badgeHtml = `<span class="product-badge badge-unavailable">${isEsgotado ? '🚫 Esgotado' : '🚫 Indisponível'}</span>`;
    } else if (product.badge) {
        badgeHtml = `<span class="product-badge ${isGranel ? 'badge-granel' : ''}">${isGranel ? '⚖️ ' + product.badge : product.badge}</span>`;
    } else if (isAllcanis) {
        badgeHtml = `<span class="product-badge badge-grao-macio">🌾 Grão Macio</span>`;
    }

    let variationsHtml = '';
    if (product.variations && product.variations.length > 0) {
        const isSize = product.variationType === 'size';
        variationsHtml = `
            <div class="product-variants-container">
                <div class="variants-header-title">
                    <span>${isSize ? '📏 Tamanho:' : '🎨 Cor:'}</span>
                    <span class="variants-selected-val">${activeVar ? activeVar.label : ''}</span>
                </div>
                <div class="variant-options-group">
                    ${product.variations.map(v => {
                        const isActive = activeVar && activeVar.label === v.label;
                        const dotHtml = v.colorHex ? `<span class="variant-color-dot" style="background-color: ${v.colorHex};"></span>` : '';
                        return `
                            <button type="button" 
                                    class="variant-pill-btn ${isSize ? 'variant-pill-size' : ''} ${isActive ? 'active' : ''}" 
                                    data-product-id="${product.id}" 
                                    data-variant="${v.label}" 
                                    onclick="selectProductVariant('${product.id}', '${v.label}', event)" 
                                    title="${v.label}">
                                ${dotHtml}
                                <span>${v.label}</span>
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    return `
        <div class="product-card ${isGranel ? 'product-card-granel' : ''} ${!isAvailable ? 'card-unavailable' : ''}" id="card-${product.id}">
            <div class="card-top-actions">
                <button class="btn-fav-card ${isFav ? 'active' : ''}" onclick="toggleFavorite('${product.id}', event)" title="${isFav ? 'Remover dos favoritos' : 'Favoritar produto'}" aria-label="Favoritar">
                    ${isFav ? '🧡' : '🤍'}
                </button>
                <button class="btn-share-card" onclick="shareProduct('${product.id}', event)" title="Compartilhar link deste produto" aria-label="Compartilhar produto">
                    ${SHARE_ICON_SVG}
                </button>
                <button class="btn-zap-card" onclick="quickBuyWhatsApp('${product.id}')" title="Tirar dúvidas ou pedir este item no WhatsApp" aria-label="Pedir no WhatsApp">
                    <span>💬</span>
                </button>
            </div>
            ${badgeHtml}
            ${imageHtml}
            <div class="card-info-wrap">
                <div class="product-meta-line">
                    <span class="meta-code">Cód: ${displayCode}</span>
                    <span class="meta-sep">•</span>
                    <span class="meta-cat">${product.subcategory || catName}</span>
                    ${isAllcanis ? `<span class="meta-grao-macio-chip" title="Possui Grão Macio">🌾 Grão Macio</span>` : ''}
                </div>
                <h3 class="product-name" onclick="openQuickView('${product.id}')" title="Clique para ver detalhes rápidos do produto">${productName}</h3>
                ${variationsHtml}
            </div>
            
            <div class="product-footer">
                ${isGranel ? (() => {
                    const pkgWeight = product.badge ? product.badge.replace(/^Pacote\s+/i, '') : (product.unit || 'Kg');
                    const matchKg = product.extraInfo ? product.extraInfo.match(/R\$\s*[\d,.]+\/kg/i) : null;
                    const kgRate = matchKg ? matchKg[0] : (product.extraInfo ? product.extraInfo.replace(/.*?\(/, '').replace(')', '') : '');
                    const subText = `Pacote ${pkgWeight}${kgRate ? ' • ' + kgRate : ''}`;
                    return `
                        <div class="granel-compact-price">
                            <div class="granel-main-price">R$ ${displayPrice.toFixed(2).replace('.', ',')}</div>
                            <div class="granel-sub-text">${subText}</div>
                        </div>
                    `;
                })() : `
                    <div class="price-row">
                        <div class="price-value">R$ ${displayPrice.toFixed(2).replace('.', ',')}</div>
                        <span class="price-unit">/${product.unit || 'un'}</span>
                    </div>
                `}

                <div class="card-actions">
                    ${!isAvailable ? `
                        <button class="btn-add-cart btn-unavailable" id="btn-add-${product.id}" disabled title="Item ${isEsgotado ? 'esgotado' : 'indisponível'} para pedidos no momento">
                            <span class="btn-cart-icon">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                            </span>
                            <span class="btn-cart-text">${isEsgotado ? 'Esgotado' : 'Indisponível'}</span>
                        </button>
                    ` : qtyInCart > 0 ? `
                        <div class="card-qty-selector ${isGranel ? 'granel-qty-selector' : ''}" id="qty-selector-${product.id}">
                            <button class="card-qty-btn minus" onclick="updateCartQty('${cartKey}', -1, event)" title="Diminuir quantidade" aria-label="Diminuir quantidade">−</button>
                            <span class="card-qty-display">
                                <span class="card-qty-val">${qtyInCart}</span>
                                <span class="card-qty-label">${isGranel ? 'no carrinho' : 'no carrinho'}</span>
                            </span>
                            <button class="card-qty-btn plus" onclick="updateCartQty('${cartKey}', 1, event)" title="Aumentar quantidade" aria-label="Aumentar quantidade">+</button>
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
    if (isLinkExpiredGlobal) return;
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
            const normCat = normalizeText(p.category);
            const normDesc = normalizeText(p.description || '');
            const graoMacioTerms = (p.graoMacio || normName.includes('allcanis')) ? 'grao macio graos macios' : '';
            const variantTerms = p.variations ? p.variations.map(v => `${v.code || ''} ${v.label || ''}`).join(' ') : '';
            const combined = `${normName} ${normCode} ${normSubcat} ${normCat} ${normDesc} ${graoMacioTerms} ${variantTerms}`;
            const matchesAllTokens = queryTokens.every(tok => {
                if (tok === 'cao' || tok === 'caes') {
                    return /\b(cao|caes|cachorro|cachorros|canino|caninos)\b/i.test(combined);
                }
                if (tok === 'gato' || tok === 'gatos') {
                    return /\b(gato|gatos|felino|felinos)\b/i.test(combined);
                }
                return combined.includes(tok);
            });
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

        if (currentSort === "price_desc") {
            return b.price - a.price;
        } else if (currentSort === "name_asc") {
            return a.name.localeCompare(b.name, 'pt-BR');
        } else {
            // price_asc (padrão): Menor Preço
            return a.price - b.price;
        }
    });

    // Botão Limpar Filtros e Indicador Ativo
    const isFiltered = currentCategory !== "todos" || currentSubcategory !== "todas" || searchQuery !== "" || currentPriceRange !== "all" || currentSort !== "price_asc" || showOnlyFavorites || currentQuickTag !== null;
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
    const activeDeptCount = document.getElementById("active-dept-count");
    if (activeDeptCount && currentCategory !== "todos") {
        activeDeptCount.textContent = `${allFilteredProducts.length} produto${allFilteredProducts.length === 1 ? '' : 's'}`;
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
    const shelfSection = document.getElementById("departments-shelf-section");
    if (shelfSection && currentCategory === "todos") shelfSection.style.display = "block";
    document.body.classList.toggle("home-view", currentCategory === "todos");
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
        const isEsgotado = product.outOfStock || product.available === false;
        actionsContainer.innerHTML = `
            <button class="btn-add-cart btn-unavailable" id="btn-add-${product.id}" disabled title="Item ${isEsgotado ? 'esgotado' : 'indisponível'} para pedidos no momento">
                <span class="btn-cart-icon">🚫</span>
                <span class="btn-cart-text">${isEsgotado ? 'Esgotado' : 'Indisponível'}</span>
            </button>
        `;
        return;
    }

    const cartKey = getActiveCartKey(productId);
    const qtyInCart = cart[cartKey] || 0;
    const isGranel = product.category === 'granel';

    if (qtyInCart > 0) {
        actionsContainer.innerHTML = `
            <div class="card-qty-selector ${isGranel ? 'granel-qty-selector' : ''}" id="qty-selector-${product.id}">
                <button class="card-qty-btn minus" onclick="updateCartQty('${cartKey}', -1, event)" title="Diminuir quantidade" aria-label="Diminuir quantidade">−</button>
                <span class="card-qty-display">
                    <span class="card-qty-val">${qtyInCart}</span>
                    <span class="card-qty-label">${isGranel ? 'no carrinho' : 'no carrinho'}</span>
                </span>
                <button class="card-qty-btn plus" onclick="updateCartQty('${cartKey}', 1, event)" title="Aumentar quantidade" aria-label="Aumentar quantidade">+</button>
            </div>
        `;
    } else {
        actionsContainer.innerHTML = `
            <button class="btn-add-cart ${isGranel ? 'btn-add-cart-granel' : ''}" id="btn-add-${product.id}" onclick="addToCart('${product.id}', event)">
                <span class="btn-cart-icon">${CART_ICON_SVG}</span>
                <span class="btn-cart-text">Adicionar</span>
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
    const cartKey = getActiveCartKey(productId);
    if (product && typeof product.stock === 'number' && product.stock > 0) {
        const currentQty = cart[cartKey] || 0;
        if (currentQty >= product.stock) {
            showToast(`⚠️ Temos apenas ${product.stock} un em estoque deste item.`);
            return;
        }
    }
    cart[cartKey] = (cart[cartKey] || 0) + 1;
    saveCart();
    
    updateCartUI();
    updateCardActionUI(productId);
    refreshQuickViewActions(productId);

    const modal = document.getElementById("cart-modal");
    if (modal && modal.classList.contains("active")) {
        renderCartDrawerItems();
    }

    const activeVar = getProductActiveVariant(product);
    const varText = activeVar ? ` (${activeVar.label})` : '';
    showToast(`✓ Adicionado ao carrinho${varText}!`);
}

function updateCartQty(cartKey, delta, event) {
    if (event) event.stopPropagation();
    const itemInfo = getCartItemInfo(cartKey);
    const product = itemInfo ? itemInfo.product : null;
    const baseId = itemInfo && itemInfo.baseProduct ? itemInfo.baseProduct.id : cartKey;

    if (delta > 0 && product && !isProductAvailable(product)) {
        showToast("⚠️ Este produto está indisponível para pedidos no momento.");
        return;
    }
    if (delta > 0 && product && typeof product.stock === 'number' && product.stock > 0) {
        const currentQty = cart[cartKey] || 0;
        if (currentQty + delta > product.stock) {
            showToast(`⚠️ Limite atingido: temos apenas ${product.stock} un deste produto.`);
            return;
        }
    }
    if (!cart[cartKey]) {
        if (delta > 0) cart[cartKey] = delta;
        else return;
    } else {
        cart[cartKey] += delta;
        if (cart[cartKey] <= 0) {
            delete cart[cartKey];
        }
    }
    saveCart();
    updateCartUI();
    updateCardActionUI(baseId);
    refreshQuickViewActions(baseId);
    renderCartDrawerItems();
}

function getCartStats() {
    let totalCount = 0;
    let totalPrice = 0;

    for (let cartKey in cart) {
        const qty = cart[cartKey];
        const itemInfo = getCartItemInfo(cartKey);
        if (itemInfo && itemInfo.product) {
            totalCount += qty;
            totalPrice += itemInfo.product.price * qty;
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

    // Restaura dados salvos do cliente e entrega se existirem
    try {
        const savedName = localStorage.getItem("agro_salinas_customer_name");
        const savedPhone = localStorage.getItem("agro_salinas_customer_phone");
        const savedBairro = localStorage.getItem("agro_salinas_neighborhood");
        const savedEnd = localStorage.getItem("agro_salinas_address");

        const inputName = document.getElementById("checkout-customer-name");
        const inputPhone = document.getElementById("checkout-customer-phone");
        const inputBairro = document.getElementById("checkout-neighborhood");
        const inputEnd = document.getElementById("checkout-address");

        if (savedName && inputName && !inputName.value) inputName.value = savedName;
        if (savedPhone && inputPhone && !inputPhone.value) inputPhone.value = savedPhone;
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
    const isStoreCart = !currentSeller || ['ADMIN', 'LOJA', 'WILLIAM', 'MEIRI', 'MEIRE', 'AGROSALINAS', 'LOJAOFICIAL', 'STORE'].includes((currentSeller.code || '').toUpperCase());

    if (btnText) {
        btnText.textContent = `Enviar Pedido para a Agro Salinas`;
    }
    if (noticeName && currentSeller) {
        noticeName.innerHTML = isStoreCart
            ? `Atendimento direto: <strong style="color: var(--primary);">Agro Salinas</strong>`
            : `Atendimento Agro Salinas • Vendedor: <strong>${currentSeller.name} (#${currentSeller.code})</strong>`;
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
        const recSection = document.getElementById("cart-recommendations-section");
        if (recSection) recSection.style.display = "none";
        if (checkoutBtn) {
            checkoutBtn.disabled = true;
            checkoutBtn.style.opacity = "0.5";
            checkoutBtn.style.cursor = "not-allowed";
        }
        const clearBtn = document.getElementById("btn-clear-cart");
        if (clearBtn) clearBtn.style.display = "none";
        const shareBtn = document.getElementById("btn-share-cart");
        if (shareBtn) shareBtn.style.display = "none";
        const headerShareBtn = document.getElementById("btn-header-share-cart");
        if (headerShareBtn) headerShareBtn.style.display = "none";
        return;
    }

    const clearBtn = document.getElementById("btn-clear-cart");
    if (clearBtn) clearBtn.style.display = "inline-flex";
    const shareBtn = document.getElementById("btn-share-cart");
    if (shareBtn) shareBtn.style.display = "flex";
    const headerShareBtn = document.getElementById("btn-header-share-cart");
    if (headerShareBtn) headerShareBtn.style.display = "inline-flex";

    if (fulfillmentSection) fulfillmentSection.style.display = "block";
    if (paymentSection) paymentSection.style.display = "block";
    if (checkoutBtn) {
        checkoutBtn.disabled = false;
        checkoutBtn.style.opacity = "1";
        checkoutBtn.style.cursor = "pointer";
    }

    let itemsHtml = "";
    for (let cartKey in cart) {
        const qty = cart[cartKey];
        const itemInfo = getCartItemInfo(cartKey);
        if (!itemInfo || !itemInfo.product) continue;
        const product = itemInfo.product;
        const variant = itemInfo.variant;
        const isGranel = product.category === 'granel';
        const unitPrice = `R$ ${product.price.toFixed(2).replace('.', ',')}`;
        const subtotal = `R$ ${(product.price * qty).toFixed(2).replace('.', ',')}`;
        const priceDisplay = qty > 1 ? `${unitPrice} un. • <strong>Total: ${subtotal}</strong>` : unitPrice;
        const title = toTitleCase(product.name);
        const granelBadge = isGranel && product.badge ? `<span style="font-size: 11px; background: #E8F5EE; color: var(--primary); padding: 1px 6px; border-radius: 4px; font-weight: 700; margin-left: 4px;">⚖️ ${product.badge}</span>` : '';
        const isSize = itemInfo.baseProduct && itemInfo.baseProduct.variationType === 'size';
        const variantTag = variant ? `<span class="cart-variant-tag">${isSize ? '📏 ' : '🎨 '}${variant.label}</span>` : '';

        itemsHtml += `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">[${product.code}] ${title} ${variantTag} ${granelBadge}</div>
                    <div class="cart-item-price">${priceDisplay}</div>
                </div>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="updateCartQty('${cartKey}', -1)" title="Diminuir quantidade">−</button>
                    <span class="qty-display">${qty}</span>
                    <button class="qty-btn" onclick="updateCartQty('${cartKey}', 1)" title="Aumentar quantidade">+</button>
                </div>
            </div>
        `;
    }

    container.innerHTML = itemsHtml;
    if (totalEl) totalEl.textContent = `R$ ${totalPrice.toFixed(2).replace('.', ',')}`;

    // Renderiza sugestões inteligentes para aumentar o ticket médio
    renderCartRecommendations();
}

// --- FUNÇÃO PARA ESVAZIAR O CARRINHO DE COMPRAS ---
function confirmClearCart() {
    const { totalCount } = getCartStats();
    if (totalCount === 0) return;

    if (confirm("Deseja realmente esvaziar todo o seu carrinho de compras?")) {
        clearCart();
    }
}

function clearCart() {
    cart = {};
    saveCart();
    updateCartUI();
    renderCartDrawerItems();
    if (typeof renderProducts === "function") {
        renderProducts();
    }
    showToast("🗑️ Carrinho esvaziado com sucesso!");
}

// --- SUGESTÕES INTELIGENTES NO CARRINHO (AUMENTO DE TICKET MÉDIO) ---
function getCartRecommendations(limit = 3) {
    const cartProductIds = Object.keys(cart).filter(id => (cart[id] || 0) > 0);
    if (cartProductIds.length === 0 || !Array.isArray(PRODUCTS)) return [];

    const cartProducts = cartProductIds
        .map(id => PRODUCTS.find(p => p.id.toString() === id.toString()))
        .filter(Boolean);

    // Mapeamento contextual do carrinho
    const hasCaes = cartProducts.some(p => p.category === 'caes' || /c[aã]o|cachorro|puppy|filhote|allcanis|premier|golden|biscoito|cookie|petisco|bifinho/i.test(p.name));
    const hasGatos = cartProducts.some(p => p.category === 'gatos' || /gato|feline|cat|felino|kiara/i.test(p.name));
    const hasPassaros = cartProducts.some(p => p.category === 'passaros_roedores' || /passar|canario|calopsita|girassol|canjica/i.test(p.name));

    // Produtos elegíveis: fora do carrinho, com estoque/disponível e com preço válido
    const candidates = PRODUCTS.filter(p => {
        if (!p || cart[p.id]) return false;
        if (!isProductAvailable(p)) return false;
        if (!p.price || p.price <= 0) return false;
        return true;
    });

    if (candidates.length === 0) return [];

    // Termos de produtos complementares de compra rápida / impulso
    const impulseRegex = /cookie|biscoito|petisco|bifinho|snack|sach[eê]|lata|recovery|canjica|girassol|palito|osso|semente|areia/i;

    const scored = candidates.map(p => {
        let score = 0;
        const nameLower = (p.name || '').toLowerCase();
        const isImpulse = impulseRegex.test(nameLower);

        if (isImpulse) score += 25;

        if (hasCaes) {
            if (p.category === 'caes') score += 15;
            if (/c[aã]o|cachorro|puppy|filhote|golden|premier/i.test(nameLower)) score += 10;
        }
        if (hasGatos) {
            if (p.category === 'gatos') score += 15;
            if (/gato|cat|felino|kiara/i.test(nameLower)) score += 10;
        }
        if (hasPassaros) {
            if (p.category === 'passaros_roedores') score += 15;
            if (/passar|canario|calopsita|canjica|girassol/i.test(nameLower)) score += 10;
        }

        // Faixa de preço acessível para aumento de ticket médio no carrinho (itens de R$ 3 a R$ 35)
        if (p.price <= 15) score += 12;
        else if (p.price <= 25) score += 8;
        else if (p.price <= 35) score += 4;
        else if (p.price > 80) score -= 15;

        if (p.featured) score += 3;

        return { product: p, score };
    });

    scored.sort((a, b) => b.score - a.score || a.product.price - b.product.price);
    return scored.slice(0, limit).map(s => s.product);
}

function renderCartRecommendations() {
    const section = document.getElementById("cart-recommendations-section");
    const list = document.getElementById("cart-recommendations-list");
    if (!section || !list) return;

    const { totalCount } = getCartStats();
    if (totalCount === 0) {
        section.style.display = "none";
        list.innerHTML = "";
        return;
    }

    const recommendations = getCartRecommendations(3);
    if (!recommendations || recommendations.length === 0) {
        section.style.display = "none";
        list.innerHTML = "";
        return;
    }

    let recsHtml = "";
    recommendations.forEach(product => {
        const title = toTitleCase(product.name);
        const priceFormatted = `R$ ${product.price.toFixed(2).replace('.', ',')}`;
        const isGranel = product.category === 'granel';
        const granelSub = isGranel && product.badge ? ` <span style="font-size: 10px; color: var(--text-muted); font-weight: 500;">(${product.badge})</span>` : '';
        const imgHtml = product.image ? `
            <img src="${product.image}" alt="${title}" class="cart-rec-img" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<span style=\\'font-size: 18px;\\'>🛍️</span>';">
        ` : `<span style="font-size: 18px;">🛍️</span>`;

        recsHtml += `
            <div class="cart-rec-card">
                <div class="cart-rec-img-wrap">
                    ${imgHtml}
                </div>
                <div class="cart-rec-info" title="${title}">
                    <div class="cart-rec-name">${title}</div>
                    <div class="cart-rec-price">${priceFormatted}${granelSub}</div>
                </div>
                <button class="btn-rec-add" onclick="addRecommendationToCart('${product.id}', event)" title="Adicionar ${title} ao carrinho">
                    + Adicionar
                </button>
            </div>
        `;
    });

    list.innerHTML = recsHtml;
    section.style.display = "block";
}

function addRecommendationToCart(productId, event) {
    if (event) event.stopPropagation();
    addToCart(productId, event);
    renderCartDrawerItems();
}

// Controle dinâmico do campo de troco ao selecionar pagamento em Dinheiro
function handlePaymentChange(paymentValue) {
    const changeContainer = document.getElementById("payment-change-container");
    if (!changeContainer) return;
    if (paymentValue === "Dinheiro") {
        changeContainer.style.display = "block";
    } else {
        changeContainer.style.display = "none";
    }
}

function toggleNeedChange(needChangeValue) {
    const inputBox = document.getElementById("payment-change-input-box");
    const inputAmount = document.getElementById("checkout-change-amount");
    if (!inputBox) return;
    if (needChangeValue === "sim") {
        inputBox.style.display = "block";
        if (inputAmount) setTimeout(() => inputAmount.focus(), 80);
    } else {
        inputBox.style.display = "none";
    }
}

// --- GERAÇÃO DE MENSAGEM DO WHATSAPP (PRESERVA TODAS AS REGRAS DE GRANEL & ENCODE SEGURO) ---
function checkoutWhatsApp() {
    const { totalCount, totalPrice } = getCartStats();
    if (totalCount === 0) {
        showToast("Seu carrinho está vazio!");
        return;
    }

    // Identificação do Cliente
    const inputCustomerName = document.getElementById("checkout-customer-name");
    const inputCustomerPhone = document.getElementById("checkout-customer-phone");
    const customerName = inputCustomerName ? inputCustomerName.value.trim() : "";
    const customerPhone = inputCustomerPhone ? inputCustomerPhone.value.trim() : "";

    if (!customerName) {
        showToast("⚠️ Por favor, informe seu Nome para identificarmos seu pedido!");
        if (inputCustomerName) {
            inputCustomerName.focus();
            inputCustomerName.style.borderColor = "#DC2626";
            setTimeout(() => inputCustomerName.style.borderColor = "", 2500);
        }
        return;
    }

    const cleanPhoneDigits = customerPhone.replace(/\D/g, "");
    if (!customerPhone || cleanPhoneDigits.length < 10) {
        showToast("⚠️ Por favor, informe seu WhatsApp com DDD para contato!");
        if (inputCustomerPhone) {
            inputCustomerPhone.focus();
            inputCustomerPhone.style.borderColor = "#DC2626";
            setTimeout(() => inputCustomerPhone.style.borderColor = "", 2500);
        }
        return;
    }

    try {
        localStorage.setItem("agro_salinas_customer_name", customerName);
        localStorage.setItem("agro_salinas_customer_phone", customerPhone);
    } catch (e) {}

    // Modalidade de Atendimento: Entrega a Domicílio vs Retirada no Balcão
    const selectedFulfillmentInput = document.querySelector('input[name="checkout_fulfillment"]:checked');
    const fulfillmentType = selectedFulfillmentInput ? selectedFulfillmentInput.value : "entrega";

    let fulfillmentDetailsText = "";
    let addressSummaryForDb = "";

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
`🛵 *FORMA DE RECEBIMENTO:*
🚚 *Entrega em Domicílio*
📍 *Bairro:* ${neighborhood}
🏠 *Endereço:* ${address}${complement ? `\n📌 *Complemento/Ref:* ${complement}` : ''}`;

        addressSummaryForDb = `${neighborhood} - ${address}${complement ? ' (' + complement + ')' : ''}`;

    } else {
        fulfillmentDetailsText = 
`🛵 *FORMA DE RECEBIMENTO:*
🏪 *Retirada no Balcão* (Cliente retira na loja)`;
        addressSummaryForDb = "Retirada no Balcão";
    }

    let itemsText = "";
    let itemsJsonForDb = [];
    let itemsSummaryList = [];

    for (let cartKey in cart) {
        const qty = cart[cartKey];
        const itemInfo = getCartItemInfo(cartKey);
        if (!itemInfo || !itemInfo.product) continue;
        const product = itemInfo.product;
        const variant = itemInfo.variant;
        const isGranel = product.category === 'granel';
        const unitPriceStr = product.price.toFixed(2).replace('.', ',');
        const subtotal = product.price * qty;
        const subtotalStr = subtotal.toFixed(2).replace('.', ',');
        const prodTitle = toTitleCase(product.name);
        const isSize = itemInfo.baseProduct && itemInfo.baseProduct.variationType === 'size';
        const variantDesc = variant ? ` (${isSize ? 'Tamanho' : 'Cor'}: ${variant.label})` : '';

        itemsJsonForDb.push({
            code: product.code,
            name: prodTitle,
            variant: variant ? variant.label : "",
            qty: qty,
            unitPrice: product.price,
            subtotal: Number(subtotal.toFixed(2))
        });
        itemsSummaryList.push(`${qty}x [CÓD ${product.code}] ${prodTitle}${variantDesc} (R$ ${subtotalStr})`);

        if (isGranel) {
            const packBadge = product.badge || `Pacote ${product.unit || 'Kg'}`;
            const extraInfo = product.extraInfo ? ` (${product.extraInfo})` : '';
            if (qty > 1) {
                itemsText += `• *${qty}x* [CÓD ${product.code}] ${prodTitle}${variantDesc}\n  ↳ *${packBadge}* Selado${extraInfo} | Un: R$ ${unitPriceStr} | Subtotal: *R$ ${subtotalStr}*\n`;
            } else {
                itemsText += `• *1x* [CÓD ${product.code}] ${prodTitle}${variantDesc}\n  ↳ *${packBadge}* Selado${extraInfo} | Valor: *R$ ${unitPriceStr}*\n`;
            }
        } else {
            if (qty > 1) {
                itemsText += `• *${qty}x* [CÓD ${product.code}] ${prodTitle}${variantDesc}\n  ↳ Un: R$ ${unitPriceStr} | Subtotal: *R$ ${subtotalStr}*\n`;
            } else {
                itemsText += `• *1x* [CÓD ${product.code}] ${prodTitle}${variantDesc}\n  ↳ Valor: *R$ ${unitPriceStr}*\n`;
            }
        }
    }

    // Identifica a forma de pagamento selecionada pelo cliente
    const selectedPayInput = document.querySelector('input[name="checkout_payment"]:checked');
    const paymentMethod = selectedPayInput ? selectedPayInput.value : "A combinar";

    let paymentDetailsText = paymentMethod;
    let paymentSummaryForDb = paymentMethod;

    if (paymentMethod === "Dinheiro") {
        const needChangeInput = document.querySelector('input[name="checkout_need_change"]:checked');
        const needChange = needChangeInput ? needChangeInput.value : "nao";
        if (needChange === "sim") {
            const inputChangeAmount = document.getElementById("checkout-change-amount");
            const changeAmount = inputChangeAmount ? inputChangeAmount.value.trim() : "";
            if (!changeAmount) {
                showToast("⚠️ Por favor, informe para quanto você precisa de troco!");
                if (inputChangeAmount) {
                    inputChangeAmount.focus();
                    inputChangeAmount.style.borderColor = "#DC2626";
                    setTimeout(() => inputChangeAmount.style.borderColor = "", 2500);
                }
                return;
            }
            const cleanVal = changeAmount.replace(/^R\$\s*/i, '');
            paymentDetailsText = `Dinheiro (Levar troco para: *R$ ${cleanVal}*)`;
            paymentSummaryForDb = `Dinheiro (Troco p/ R$ ${cleanVal})`;
        } else {
            paymentDetailsText = `Dinheiro (*Não precisa de troco - valor exato*)`;
            paymentSummaryForDb = `Dinheiro (Sem troco)`;
        }
    }

    // Destino SEMPRE direto para o WhatsApp oficial da Agro Salinas
    const targetWhatsapp = (typeof VENDAS_CONFIG !== 'undefined' && VENDAS_CONFIG.lojaWhatsApp) 
        ? VENDAS_CONFIG.lojaWhatsApp 
        : "5551995624230";

    const isStoreCheckout = !currentSeller || ['ADMIN', 'LOJA', 'WILLIAM', 'MEIRI', 'MEIRE', 'AGROSALINAS', 'LOJAOFICIAL', 'STORE'].includes((currentSeller.code || '').toUpperCase());

    // Pedidos de vendedores vão com código do vendedor; pedidos da loja/Meire/William vão SEM código
    const sellerTag = (!isStoreCheckout && currentSeller && currentSeller.code)
        ? `🏷️ *Código do Vendedor:* #${currentSeller.code} (${currentSeller.name})\n`
        : '';

    const greeting = `Olá, Agro Salinas! Gostaria de fazer este pedido:`;
    const customerLine = `👤 *Cliente:* ${customerName}\n📱 *WhatsApp:* ${customerPhone}`;

    const message = 
`🐾 *NOVO PEDIDO — AGRO SALINAS*
════════════════════════════════

${greeting}
${customerLine}

📋 *ITENS PARA SEPARAÇÃO:*
${itemsText}
────────────────────────────────
💰 *TOTAL: R$ ${totalPrice.toFixed(2).replace('.', ',')}*
💳 *Pagamento:* ${paymentDetailsText}

${fulfillmentDetailsText}

────────────────────────────────
${sellerTag}📱 *Origem:* Catálogo Digital Agro Salinas

Poderia me confirmar a disponibilidade e o prazo de separação/despacho? Obrigado!`;

    // Registra o pedido no banco de dados (Supabase) automaticamente em segundo plano
    if (typeof saveOrderToSupabase === "function") {
        saveOrderToSupabase({
            seller_code: isStoreCheckout ? "LOJA" : (currentSeller && currentSeller.code ? currentSeller.code : "LOJA"),
            seller_name: isStoreCheckout ? "Agro Salinas (Loja)" : (currentSeller && currentSeller.name ? currentSeller.name : "Agro Salinas (Loja)"),
            customer_name: customerName,
            customer_phone: customerPhone,
            fulfillment_type: fulfillmentType === "entrega" ? "Entrega em Domicílio" : "Retirada no Balcão",
            address_details: addressSummaryForDb,
            payment_method: paymentSummaryForDb,
            items_json: itemsJsonForDb,
            items_summary: itemsSummaryList.join(" | "),
            total_price: Number(totalPrice.toFixed(2))
        });
    }

    const whatsappUrl = `https://wa.me/${targetWhatsapp}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
}

function quickBuyWhatsApp(productId) {
    const product = PRODUCTS.find(p => p.id.toString() === productId.toString());
    if (!product) return;

    // Destino SEMPRE direto para o WhatsApp oficial da Agro Salinas
    const targetWhatsapp = (typeof VENDAS_CONFIG !== 'undefined' && VENDAS_CONFIG.lojaWhatsApp) 
        ? VENDAS_CONFIG.lojaWhatsApp 
        : "5551995624230";

    const isStoreQuick = !currentSeller || ['ADMIN', 'LOJA', 'WILLIAM', 'MEIRI', 'MEIRE', 'AGROSALINAS', 'LOJAOFICIAL', 'STORE'].includes((currentSeller.code || '').toUpperCase());

    const isGranel = product.category === 'granel';
    const activeVar = getProductActiveVariant(product);
    const displayCode = activeVar && activeVar.code ? activeVar.code : product.code;
    const displayPrice = activeVar && activeVar.price ? activeVar.price : product.price;
    const isSize = product.variationType === 'size';
    const variantDesc = activeVar ? ` (${isSize ? 'Tamanho' : 'Cor'}: ${activeVar.label})` : '';
    const prodTitle = toTitleCase(product.name);
    const isAvailable = isProductAvailable(product);

    // Pedidos de vendedores vão com o código do vendedor; pedidos da loja/Meire/William vão SEM código
    const sellerTag = (!isStoreQuick && currentSeller && currentSeller.code)
        ? `\n🏷️ *Código do Vendedor:* #${currentSeller.code} (${currentSeller.name})`
        : '';

    let message = "";
    if (isGranel) {
        const packBadge = product.badge || `Pacote ${product.unit || 'Kg'}`;
        const extraInfo = product.extraInfo ? ` (${product.extraInfo})` : '';
        if (!isAvailable) {
            message = 
`🐾 *CONSULTA DE PRODUTO — AGRO SALINAS*
════════════════════════════════

Olá, Agro Salinas! Gostaria de saber a previsão de disponibilidade deste produto a granel:

⚖️ *[CÓD ${displayCode}] ${prodTitle}${variantDesc}*
📦 *Embalagem:* ${packBadge} Selado${extraInfo}
💰 *Preço de referência:* R$ ${displayPrice.toFixed(2).replace('.', ',')}
${sellerTag}
📱 *Origem:* Catálogo Digital Agro Salinas`;
        } else {
            message = 
`🐾 *NOVO PEDIDO / INTERESSE — AGRO SALINAS*
════════════════════════════════

Olá, Agro Salinas! Tenho interesse neste produto a granel:

⚖️ *[CÓD ${displayCode}] ${prodTitle}${variantDesc}*
📦 *Embalagem:* ${packBadge} Selado${extraInfo}
💰 *Preço:* R$ ${displayPrice.toFixed(2).replace('.', ',')}
${sellerTag}
📱 *Origem:* Catálogo Digital Agro Salinas`;
        }
    } else {
        if (!isAvailable) {
            message = 
`🐾 *CONSULTA DE PRODUTO — AGRO SALINAS*
════════════════════════════════

Olá, Agro Salinas! Gostaria de saber a previsão deste produto no catálogo:

📦 *[CÓD ${displayCode}] ${prodTitle}${variantDesc}*
💰 *Preço de referência:* R$ ${displayPrice.toFixed(2).replace('.', ',')} / ${product.unit || 'un'}
${sellerTag}
📱 *Origem:* Catálogo Digital Agro Salinas`;
        } else {
            message = 
`🐾 *NOVO PEDIDO / INTERESSE — AGRO SALINAS*
════════════════════════════════

Olá, Agro Salinas! Tenho interesse no seguinte produto do catálogo:

📦 *[CÓD ${displayCode}] ${prodTitle}${variantDesc}*
💰 *Preço:* R$ ${displayPrice.toFixed(2).replace('.', ',')} / ${product.unit || 'un'}
${sellerTag}
📱 *Origem:* Catálogo Digital Agro Salinas`;
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
    const baseUrl = (typeof getBaseAppUrl === "function")
        ? getBaseAppUrl()
        : "https://agro-salinas-rose.vercel.app";
    const finalUrl = `${baseUrl.replace(/\/$/, '')}/?v=${encodeURIComponent(name)}`;
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

// --- COMPARTILHAMENTO DE PRODUTO INDIVIDUAL (LINK DIRETO COM PRESERVAÇÃO DE VENDEDOR) ---
function buildProductShareUrl(productId) {
    const product = PRODUCTS.find(p => p.id.toString() === productId.toString());
    if (!product) return window.location.href;

    const baseUrl = (typeof getBaseAppUrl === "function")
        ? getBaseAppUrl()
        : (window.location.origin + window.location.pathname.replace(/\/$/, ""));

    const finalBase = baseUrl.replace(/\/$/, "");
    const prodParam = encodeURIComponent(product.code || product.id);

    let shareUrl = `${finalBase}/?p=${prodParam}`;

    // Preserva o vendedor atual
    if (currentSeller && currentSeller.code && currentSeller.code !== "LOJA") {
        shareUrl += `&v=${encodeURIComponent(currentSeller.code.toLowerCase())}`;
    }

    // Preserva o token de 30 dias se houver
    const urlParams = new URLSearchParams(window.location.search);
    const tParam = urlParams.get("t");
    if (tParam) {
        shareUrl += `&t=${encodeURIComponent(tParam)}`;
    }

    return shareUrl;
}

async function shareProduct(productId, event) {
    if (event) event.stopPropagation();

    const product = PRODUCTS.find(p => p.id.toString() === productId.toString());
    if (!product) return;

    const shareUrl = buildProductShareUrl(productId);
    const prodName = toTitleCase(product.name);
    const priceText = `R$ ${product.price.toFixed(2).replace('.', ',')}`;

    const shareTitle = `${prodName} | Agro Salinas`;
    const shareText = `Olha só este produto na Agro Salinas: ${prodName} por apenas ${priceText}! Confira no catálogo digital:`;

    // 1. Tenta o compartilhamento nativo do dispositivo (Mobile / Web Share API)
    if (navigator.share) {
        try {
            await navigator.share({
                title: shareTitle,
                text: shareText,
                url: shareUrl
            });
            showToast("✓ Compartilhado com sucesso!");
            return;
        } catch (err) {
            if (err && err.name === 'AbortError') return;
        }
    }

    // 2. Fallback: Copia link para a área de transferência
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            showToast("🔗 Link do produto copiado! Pode colar e enviar.");
            return;
        }
    } catch (e) {}

    // 3. Fallback alternativo para navegadores restritos
    prompt("Copie o link do produto abaixo:", shareUrl);
}

// --- TRATAMENTO DE ACESSO DIRETO A UM PRODUTO (?p=562) ---
function handleDirectProductUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const targetP = urlParams.get("p") || urlParams.get("produto") || urlParams.get("item") || urlParams.get("id");
    if (!targetP) return;

    const cleanP = decodeURIComponent(targetP).trim();
    const product = PRODUCTS.find(p => p.id.toString() === cleanP || (p.code && p.code.toString().toLowerCase() === cleanP.toLowerCase()));
    if (!product) return;

    // Aguarda a renderização inicial e abre o produto diretamente
    setTimeout(() => {
        const cardEl = document.getElementById(`card-${product.id}`);
        if (cardEl) {
            cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
            cardEl.classList.add("highlight-pulse");
            setTimeout(() => cardEl.classList.remove("highlight-pulse"), 4000);
        }
        openQuickView(product.id);
    }, 350);
}

// --- COMPARTILHAMENTO DE CARRINHO COMPLETO (LINK COM PRODUTOS PRONTOS) ---
function buildCartShareUrl() {
    const { totalCount } = getCartStats();
    if (totalCount === 0) return window.location.href;

    const baseUrl = (typeof getBaseAppUrl === "function")
        ? getBaseAppUrl()
        : (window.location.origin + window.location.pathname.replace(/\/$/, ""));

    const finalBase = baseUrl.replace(/\/$/, "");

    // Serializa os itens do carrinho no formato "cartKey:qty"
    const items = [];
    for (const key in cart) {
        const qty = parseInt(cart[key], 10);
        if (qty > 0) {
            // Substitui '__' por '~' para manter a URL amigável e limpa
            const safeKey = key.replace(/__/g, "~");
            items.push(`${encodeURIComponent(safeKey)}:${qty}`);
        }
    }

    if (items.length === 0) return finalBase;

    let shareUrl = `${finalBase}/?cart=${items.join(",")}`;

    // Preserva o vendedor atual
    if (currentSeller && currentSeller.code && currentSeller.code !== "LOJA") {
        shareUrl += `&v=${encodeURIComponent(currentSeller.code.toLowerCase())}`;
    }

    // Preserva o token de 30 dias se houver
    const urlParams = new URLSearchParams(window.location.search);
    const tParam = urlParams.get("t");
    if (tParam) {
        shareUrl += `&t=${encodeURIComponent(tParam)}`;
    }

    return shareUrl;
}

async function shareCart(event) {
    if (event) event.stopPropagation();

    const { totalCount, totalPrice } = getCartStats();
    if (totalCount === 0) {
        showToast("⚠️ Adicione produtos ao carrinho antes de compartilhar!");
        return;
    }

    const shareUrl = buildCartShareUrl();
    const formattedTotal = `R$ ${totalPrice.toFixed(2).replace('.', ',')}`;

    // Monta o resumo dos produtos selecionados
    const lines = [];
    for (const cartKey in cart) {
        const qty = cart[cartKey];
        if (qty <= 0) continue;
        const itemInfo = getCartItemInfo(cartKey);
        if (!itemInfo || !itemInfo.product) continue;
        const p = itemInfo.product;
        const variantText = itemInfo.variant ? ` (${itemInfo.variant.label})` : "";
        const itemSubtotal = `R$ ${(p.price * qty).toFixed(2).replace('.', ',')}`;
        lines.push(`• ${qty}x ${toTitleCase(p.name)}${variantText} - ${itemSubtotal}`);
    }

    const shareTitle = `Carrinho Pronto (${totalCount} ${totalCount === 1 ? 'item' : 'itens'}) | Agro Salinas`;
    const shareText = `🛒 *CARRINHO PRONTO — AGRO SALINAS*\n\n` +
        `Preparei este pedido para você:\n` +
        lines.join("\n") +
        `\n\n💰 *Total: ${formattedTotal}*` +
        `\n\nToque no link abaixo para abrir o carrinho já montado e concluir o pedido:`;

    // 1. Tenta compartilhamento nativo (WhatsApp, Telegram, etc. no celular)
    if (navigator.share) {
        try {
            await navigator.share({
                title: shareTitle,
                text: shareText,
                url: shareUrl
            });
            showToast("✓ Carrinho compartilhado com sucesso!");
            return;
        } catch (err) {
            if (err && err.name === 'AbortError') return;
        }
    }

    // 2. Fallback: Copia o link direto para a área de transferência
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            showToast("🔗 Link do carrinho copiado! Pode enviar pelo WhatsApp.");
            return;
        }
    } catch (e) {}

    // 3. Fallback alternativo para navegadores restritos
    prompt("Copie o link do carrinho pronto abaixo:", shareUrl);
}

// --- TRATAMENTO DE ACESSO DIRETO A UM CARRINHO PRONTO (?cart=96:2,749:1) ---
function handleDirectCartUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const cartParam = urlParams.get("cart") || urlParams.get("c") || urlParams.get("carrinho");
    if (!cartParam) return;

    try {
        const rawEntries = decodeURIComponent(cartParam).split(",");
        let addedCount = 0;

        rawEntries.forEach(entry => {
            const trimmed = entry.trim();
            if (!trimmed) return;

            const parts = trimmed.split(":");
            const rawKey = parts[0].trim();
            const qty = parts.length > 1 ? parseInt(parts[1], 10) : 1;
            if (isNaN(qty) || qty <= 0) return;

            // Restaura chave (suporta ~ como separador de variação)
            const safeKey = rawKey.replace(/~/g, "__");
            let baseId = safeKey;
            let variantLabel = null;

            if (safeKey.includes("__")) {
                const subParts = safeKey.split("__");
                baseId = subParts[0];
                variantLabel = subParts[1];
            }

            // Busca produto por ID ou Código
            const product = PRODUCTS.find(p =>
                p.id.toString() === baseId.toString() ||
                (p.code && p.code.toString().toLowerCase() === baseId.toLowerCase())
            );

            if (!product) return;

            let realKey = product.id.toString();
            if (variantLabel && Array.isArray(product.variations)) {
                const matchVar = product.variations.find(v =>
                    v.label.toLowerCase() === variantLabel.toLowerCase()
                );
                if (matchVar) {
                    realKey = `${product.id}__${matchVar.label}`;
                }
            }

            cart[realKey] = qty;
            addedCount++;
        });

        if (addedCount > 0) {
            saveCart();
            updateCartUI();
            renderCartDrawerItems();

            // Abre o carrinho após a carga para o cliente já ver o pedido pronto
            setTimeout(() => {
                openCartDrawer();
                showToast("🛒 Carrinho carregado com sucesso!");
            }, 400);
        }
    } catch (err) {
        console.warn("Erro ao carregar carrinho compartilhado:", err);
    }
}

// --- EVENTOS & BUSCA (COM DEBOUNCE DE 300MS) ---
function setupEventListeners() {
    const searchInput = document.getElementById("search-input");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                searchQuery = e.target.value.trim();
                const shelfSection = document.getElementById("departments-shelf-section");
                if (shelfSection) {
                    shelfSection.style.display = (searchQuery || currentCategory !== "todos") ? "none" : "block";
                }
                document.body.classList.toggle("home-view", currentCategory === "todos" && !searchQuery);
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

    const phoneInput = document.getElementById("checkout-customer-phone");
    if (phoneInput) {
        phoneInput.addEventListener("input", (e) => {
            let v = e.target.value.replace(/\D/g, "");
            if (v.length > 11) v = v.slice(0, 11);
            if (v.length > 10) {
                e.target.value = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
            } else if (v.length > 6) {
                e.target.value = `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
            } else if (v.length > 2) {
                e.target.value = `(${v.slice(0, 2)}) ${v.slice(2)}`;
            } else if (v.length > 0) {
                e.target.value = `(${v}`;
            }
        });
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
    currentSort = "price_asc";
    currentPriceRange = "all";
    searchQuery = "";
    showOnlyFavorites = false;

    const searchInput = document.getElementById("search-input");
    if (searchInput) searchInput.value = "";

    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) sortSelect.value = "price_asc";
    const sidebarSortSelect = document.getElementById("sidebar-sort-select");
    if (sidebarSortSelect) sidebarSortSelect.value = "price_asc";

    const priceRangeSelect = document.getElementById("price-range-select");
    if (priceRangeSelect) priceRangeSelect.value = "all";
    const sidebarPriceSelect = document.getElementById("sidebar-price-select");
    if (sidebarPriceSelect) sidebarPriceSelect.value = "all";

    const btnFav = document.getElementById("btn-view-favorites");
    if (btnFav) btnFav.classList.remove("active");

    currentQuickTag = null;
    document.querySelectorAll(".quick-tag-pill, .sidebar-tag-btn").forEach(p => p.classList.remove("active"));

    document.body.classList.add("home-view");
    const shelfSection = document.getElementById("departments-shelf-section");
    if (shelfSection) shelfSection.style.display = "block";
    const activeDeptBanner = document.getElementById("active-dept-banner");
    if (activeDeptBanner) activeDeptBanner.style.display = "none";

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
    const placeholderSvg = getCategoryPlaceholderSvg(product.category, catName);

    const imageHtml = product.image ? `
        <div class="quickview-image-wrap">
            <img src="${product.image}" alt="${title}" class="quickview-img" onerror="handleImageError(this, '${product.category}', '${catName}')">
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

    // Destaque Especial: Grão Macio (Allcanis)
    const isAllcanis = lower.includes('allcanis') || !!product.graoMacio;
    if (isAllcanis) {
        tags.push('<span class="profile-tag highlight-grao-macio">🌾 Grão Macio</span>');
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
        const tipDog = isAllcanis
            ? `💡 <em>Dica Allcanis (Grão Macio):</em> Os grãos macios proporcionam conforto extra na mastigação de cães sêniores e de portes variados. Fracione em 2 a 3 porções diárias e mantenha água fresca sempre disponível.`
            : `💡 <em>Dica Agro Salinas:</em> Fracione em 2 a 3 porções ao longo do dia. Mantenha um pote de água limpa e fresca sempre acessível ao pet.`;

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
                    ${tipDog}
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
        const tipGranel = isAllcanis
            ? `💡 <em>Grãos Macios Preservados:</em> A selagem especial Agro Salinas mantém a textura macia, o frescor e o aroma característico da Allcanis!`
            : `💡 <em>Armazenamento:</em> Mantenha em local seco e arejado, fechando bem após o uso diário.`;

        guideSectionHtml = `
            <div class="quickview-section-card">
                <div class="quickview-section-title">
                    <span>⚖️ Selagem e Qualidade Agro Salinas</span>
                </div>
                <div style="font-size: 12px; color: #334155; line-height: 1.5; padding: 4px 0;">
                    <p>• <strong>Pacote Selado:</strong> Pesado na medida exata com selagem higiênica que impede a entrada de umidade.</p>
                    <p style="margin-top: 4px;">• <strong>Nutrientes Preservados:</strong> Aroma, textura e integridade nutricional idênticos ao pacote lacrado de fábrica.</p>
                    <p style="margin-top: 4px;">• <strong>Economia Inteligente:</strong> A melhor ração para o seu companheiro com preço muito mais acessível por quilo.</p>
                </div>
                <div class="quickview-tip">
                    ${tipGranel}
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
    const isEsgotado = product.outOfStock || product.available === false;
    const unavailableBadge = !isAvailable ? `<span class="quickview-unavailable-tag">${isEsgotado ? '🚫 Esgotado na Loja' : '🚫 Indisponível no Momento'}</span>` : '';

    const activeVar = getProductActiveVariant(product);
    const displayCode = activeVar && activeVar.code ? activeVar.code : product.code;
    const displayPrice = activeVar && activeVar.price ? activeVar.price : product.price;
    const isSize = product.variationType === 'size';

    let variationsHtml = '';
    if (product.variations && product.variations.length > 0) {
        variationsHtml = `
            <div class="quickview-variants-box">
                <div class="variants-header-title" style="margin-bottom: 8px;">
                    <span>${isSize ? '📏 Selecione o Tamanho:' : '🎨 Selecione a Cor:'}</span>
                    <span class="qv-variant-selected-val variants-selected-val">${activeVar ? activeVar.label : ''}</span>
                </div>
                <div class="variant-options-group">
                    ${product.variations.map(v => {
                        const isActive = activeVar && activeVar.label === v.label;
                        const dotHtml = v.colorHex ? `<span class="variant-color-dot" style="background-color: ${v.colorHex};"></span>` : '';
                        return `
                            <button type="button" 
                                    class="variant-pill-btn ${isSize ? 'variant-pill-size' : ''} ${isActive ? 'active' : ''}" 
                                    data-product-id="${product.id}" 
                                    data-variant="${v.label}" 
                                    onclick="selectProductVariant('${product.id}', '${v.label}', event)" 
                                    title="${v.label}">
                                ${dotHtml}
                                <span>${v.label}</span>
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    modalContent.innerHTML = `
        <div class="quickview-top-actions">
            <button class="btn-quickview-share" onclick="shareProduct('${product.id}', event)" title="Compartilhar link deste produto" aria-label="Compartilhar">
                ${SHARE_ICON_SVG}
                <span>Compartilhar</span>
            </button>
            <button class="btn-close-quickview" onclick="closeQuickViewModal()" title="Fechar janela (Esc)" aria-label="Fechar">✕</button>
        </div>
        <div class="quickview-grid">
            ${imageHtml}
            <div class="quickview-header-info">
                <div class="quickview-meta-row">
                    <span class="quickview-code-tag">CÓD ${displayCode}</span>
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
                        <span class="quickview-price-val">${displayPrice.toFixed(2).replace('.', ',')}</span>
                        <span class="quickview-unit">${unitText}</span>
                    </div>
                </div>
            </div>

            ${variationsHtml}

            ${isAllcanis ? `
                <div class="grao-macio-highlight-card">
                    <div class="grao-macio-header">
                        <span class="grao-macio-badge">⭐ DESTAQUE ALLCANIS</span>
                        <span class="grao-macio-status">Grão Macio Comprovado</span>
                    </div>
                    <div class="grao-macio-content">
                        <div class="grao-macio-title-row">
                            <span class="grao-macio-icon">🌾</span>
                            <h4 class="grao-macio-title">Possui Grão Macio de Fácil Mastigação</h4>
                        </div>
                        <p class="grao-macio-desc">
                            Esta ração Allcanis conta com <strong>grãos macios</strong> de textura diferenciada e alta palatabilidade. Desenvolvida especialmente para facilitar a mastigação e favorecer uma digestão suave, sendo ideal para cães com sensibilidade bucal, animais sêniores ou que preferem alimentos com textura macia.
                        </p>
                    </div>
                </div>
            ` : ''}

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
    const cartKey = getActiveCartKey(productId);
    const qtyInCart = cart[cartKey] || 0;
    const isGranel = product.category === 'granel';

    let cartActionHtml = "";
    const isEsgotado = product.outOfStock || product.available === false;
    if (!isAvailable) {
        cartActionHtml = `
            <button class="btn-add-cart btn-unavailable" style="width: 100%; height: 46px; font-size: 15px; font-weight: 800;" disabled title="Item ${isEsgotado ? 'esgotado' : 'indisponível'} para pedidos no momento">
                <span class="btn-cart-icon">🚫</span>
                <span class="btn-cart-text">${isEsgotado ? 'Esgotado na Loja' : 'Indisponível para Compra'}</span>
            </button>
        `;
    } else if (qtyInCart > 0) {
        cartActionHtml = `
            <div class="card-qty-selector ${isGranel ? 'granel-qty-selector' : ''}" style="width: 100%; justify-content: space-between; height: 46px;">
                <button class="card-qty-btn minus" style="width: 46px; height: 46px; font-size: 22px;" onclick="updateCartQty('${cartKey}', -1, event)" title="Diminuir quantidade" aria-label="Diminuir quantidade">−</button>
                <span class="card-qty-display">
                    <span class="card-qty-val" style="font-size: 17px;">${qtyInCart}</span>
                    <span class="card-qty-label" style="font-size: 11px;">${isGranel ? 'pct no carrinho' : 'no carrinho'}</span>
                </span>
                <button class="card-qty-btn plus" style="width: 46px; height: 46px; font-size: 22px;" onclick="updateCartQty('${cartKey}', 1, event)" title="Aumentar quantidade" aria-label="Aumentar quantidade">+</button>
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
        closeHoursModal();
    }
});

// --- SISTEMA DE HORÁRIOS DE FUNCIONAMENTO & ATENDIMENTO DA LOJA ---
function getStoreScheduleStatus() {
    // Horário oficial no fuso de Brasília (Rio Grande do Sul / UTC-3)
    const now = new Date();
    const brDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const day = brDate.getDay(); // 0: Domingo, 1: Segunda, ..., 6: Sábado
    const mins = brDate.getHours() * 60 + brDate.getMinutes();

    const mStart = 8 * 60; // 08:00
    const mEnd = 11 * 60 + 45; // 11:45
    const aStart = 14 * 60; // 14:00
    const aEndWeekday = 18 * 60 + 30; // 18:30
    const aEndSaturday = 18 * 60; // 18:00

    if (day === 0) {
        return {
            isOpen: false,
            isLunch: false,
            statusText: "Fechado hoje (Domingo)",
            shortBadge: "Fechado",
            nextInfo: "Abre segunda-feira às 08:00",
            statusClass: "status-closed"
        };
    }

    const isSaturday = day === 6;
    const aEnd = isSaturday ? aEndSaturday : aEndWeekday;

    if (mins >= mStart && mins < mEnd) {
        return {
            isOpen: true,
            isLunch: false,
            statusText: "Aberto agora (Manhã até 11:45)",
            shortBadge: "Aberto agora",
            nextInfo: "Intervalo de almoço às 11:45",
            statusClass: "status-open"
        };
    } else if (mins >= mEnd && mins < aStart) {
        return {
            isOpen: false,
            isLunch: true,
            statusText: "Intervalo de almoço",
            shortBadge: "Almoço",
            nextInfo: "Reabre hoje às 14:00",
            statusClass: "status-lunch"
        };
    } else if (mins >= aStart && mins < aEnd) {
        const closeTime = isSaturday ? "18:00" : "18:30";
        return {
            isOpen: true,
            isLunch: false,
            statusText: `Aberto agora (Tarde até ${closeTime})`,
            shortBadge: "Aberto agora",
            nextInfo: `Fecha hoje às ${closeTime}`,
            statusClass: "status-open"
        };
    } else if (mins < mStart) {
        return {
            isOpen: false,
            isLunch: false,
            statusText: "Fechado no momento",
            shortBadge: "Fechado",
            nextInfo: "Abre hoje às 08:00",
            statusClass: "status-closed"
        };
    } else {
        const nextDay = isSaturday ? "segunda-feira às 08:00" : "amanhã às 08:00";
        return {
            isOpen: false,
            isLunch: false,
            statusText: "Fechado no momento",
            shortBadge: "Fechado",
            nextInfo: `Abre ${nextDay}`,
            statusClass: "status-closed"
        };
    }
}

function updateTopbarHoursUI() {
    const status = getStoreScheduleStatus();

    // Atualiza o indicador e badge da barra superior
    const dot = document.getElementById("topbar-status-dot");
    const badge = document.getElementById("topbar-hours-status-badge");
    const sidebarBadge = document.getElementById("sidebar-hours-status-badge");

    if (dot) {
        dot.className = `topbar-status-dot ${status.statusClass}`;
    }
    if (badge) {
        badge.textContent = status.shortBadge;
        badge.className = `topbar-hours-status-badge ${status.statusClass}`;
    }
    if (sidebarBadge) {
        sidebarBadge.textContent = status.shortBadge;
        sidebarBadge.className = `sidebar-hours-pill ${status.statusClass}`;
    }
}

function openHoursModal() {
    const modal = document.getElementById("hours-modal");
    if (!modal) return;
    renderHoursModalContent();
    modal.classList.add("active");
}

function closeHoursModal() {
    const modal = document.getElementById("hours-modal");
    if (modal) modal.classList.remove("active");
}

function renderHoursModalContent() {
    const banner = document.getElementById("hours-live-status-banner");
    if (!banner) return;
    const status = getStoreScheduleStatus();

    let bannerIcon = "🟢";
    let bannerTitle = "Loja Aberta Agora!";
    let bannerDesc = status.nextInfo;

    if (status.isLunch) {
        bannerIcon = "🟡";
        bannerTitle = "Intervalo de Almoço";
        bannerDesc = "Fechado temporariamente. Reabrimos às 14:00!";
    } else if (!status.isOpen) {
        bannerIcon = "⚪";
        bannerTitle = "Loja Fechada no Momento";
        bannerDesc = status.nextInfo;
    }

    banner.className = `hours-live-status-banner ${status.statusClass}`;
    banner.innerHTML = `
        <div class="hours-live-status-icon">${bannerIcon}</div>
        <div class="hours-live-status-details">
            <h4 class="hours-live-status-title">${bannerTitle}</h4>
            <p class="hours-live-status-desc">${bannerDesc}</p>
        </div>
    `;
}
