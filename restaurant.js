/**
 * MenuDirect SaaS — Logique Menu Public, Panier 3-Colonnes, Recherche en Direct & Tunnel de Commande
 */

(function () {
    let restaurantData = null;
    let categories = [];
    let dishes = [];
    let cart = []; // [{ id, name, price, quantity, image_url }]
    let favorites = []; // [dishId, ...]

    let currentLanguage = localStorage.getItem('menudirect_lang') || 'fr';
    let translations = { dishes: {} };
    let activeCategoryId = 'all';
    let searchQuery = '';
    let isFavoritesFilterActive = false;

    const DELIVERY_FEE = 1000; // 1 000 FCFA

    // Dictionnaire des traductions des catégories et labels
    const CATEGORY_TRANSLATIONS = {
        en: {
            'Tout le menu': 'All Menu',
            'Tous': 'All',
            'Grillades & Viandes': 'Grills & Meats',
            'Spécialités Béninoises': 'Beninese Specialties',
            'Accompagnements': 'Side Dishes',
            'Boissons & Jus Frais': 'Drinks & Juices',
            'Desserts': 'Desserts',
            'Plats populaires': 'Popular Dishes'
        },
        pt: {
            'Tout le menu': 'Todo o Cardápio',
            'Tous': 'Todos',
            'Grillades & Viandes': 'Grelhados e Carnes',
            'Spécialités Béninoises': 'Especialidades Beninenses',
            'Accompagnements': 'Acompanhamentos',
            'Boissons & Jus Frais': 'Bebidas e Sucos',
            'Desserts': 'Sobremesas',
            'Plats populaires': 'Pratos Populares'
        },
        es: {
            'Tout le menu': 'Todo el Menú',
            'Tous': 'Todos',
            'Grillades & Viandes': 'Parrilladas y Carnes',
            'Spécialités Béninoises': 'Especialidades Beninesas',
            'Accompagnements': 'Acompañamientos',
            'Boissons & Jus Frais': 'Bebidas y Jugos',
            'Desserts': 'Postres',
            'Plats populaires': 'Platos Populares'
        },
        fon: {
            'Tout le menu': 'Nùɖuɖu lɛ bǐ',
            'Tous': 'Bǐ',
            'Grillades & Viandes': 'Lan mimɛ lɛ',
            'Spécialités Béninoises': 'Benin tɔn nùɖuɖu lɛ',
            'Accompagnements': 'Nù gɔna lɛ',
            'Boissons & Jus Frais': 'Nùnunù sinmɛ lɛ',
            'Desserts': 'Nùvivɛ lɛ',
            'Plats populaires': 'Nùɖuɖu taji lɛ'
        }
    };

    const UI_TRANSLATIONS = {
        fr: { add: 'Ajouter', emptyDesc: 'Cuisiné avec passion et ingrédients frais locaux.', popularTitle: 'Plats populaires' },
        en: { add: 'Add', emptyDesc: 'Cooked with passion and fresh local ingredients.', popularTitle: 'Popular Dishes' },
        pt: { add: 'Adicionar', emptyDesc: 'Cozinhado com paixão e ingredientes frescos locais.', popularTitle: 'Pratos Populares' },
        es: { add: 'Añadir', emptyDesc: 'Cocinado con pasión e ingredientes locales frescos.', popularTitle: 'Platos Populares' },
        fon: { add: 'Gɔ́ na', emptyDesc: 'Nùɖuɖu ɖagbe e sɔ́ akpakpa kpo nǔ mumu lɛ kpo ɖa é.', popularTitle: 'Nùɖuɖu taji lɛ' }
    };

    // Icônes représentatives par catégorie
    const CATEGORY_ICONS = {
        'Grillades & Viandes': '🥩',
        'Spécialités Béninoises': '🍲',
        'Accompagnements': '🍟',
        'Boissons & Jus Frais': '🍹',
        'Burgers': '🍔',
        'Pizzas': '🍕',
        'Salades': '🥗',
        'Desserts': '🍰'
    };

    function translateCategoryName(name, categoryId) {
        if (currentLanguage === 'fr' || !name) return name;
        if (translations.categories && translations.categories[currentLanguage]) {
            if (categoryId && translations.categories[currentLanguage][categoryId]) {
                return translations.categories[currentLanguage][categoryId];
            }
        }
        const dict = CATEGORY_TRANSLATIONS[currentLanguage];
        if (dict && dict[name]) return dict[name];
        return name;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatFCFA(amount) {
        return new Intl.NumberFormat('fr-FR').format(amount || 0) + ' FCFA';
    }

    function getSlugFromUrl() {
        const parts = window.location.pathname.split('/');
        const restoIndex = parts.indexOf('restaurant');
        if (restoIndex !== -1 && parts[restoIndex + 1]) {
            return parts[restoIndex + 1].trim();
        }
        const slug = parts.filter(Boolean)[0];
        return slug || 'le-jardin-des-saveurs';
    }

    // Initialisation et chargement des données
    async function loadPublicMenu() {
        restoreFavorites();
        const slug = getSlugFromUrl();

        try {
            const res = await fetch(`/api/public/${slug}`);
            if (!res.ok) {
                document.getElementById('menuMainContent').innerHTML = `
                    <div class="empty-search-box">
                        <div style="font-size: 3rem; margin-bottom: 1rem;">🍽️</div>
                        <h2 style="color: #FFF;">Restaurant introuvable</h2>
                        <p style="margin-top: 0.5rem; margin-bottom: 1.5rem; color: var(--text-muted);">
                            Ce restaurant n'existe pas ou son adresse a été modifiée.
                        </p>
                        <a href="/" class="btn-checkout-primary" style="display: inline-flex; width: auto; text-decoration: none;">
                            Retourner à l'accueil
                        </a>
                    </div>
                `;
                return;
            }

            const data = await res.json();
            restaurantData = data.restaurant;
            categories = data.categories || [];
            dishes = data.dishes || [];
            translations = data.translations || { dishes: {} };

            renderRestoHeader();
            setupLanguageSelector();
            setupSearch();
            setupSidebarNav();
            renderCategoryNav();
            renderDishesCatalogue();
            restoreCart();

        } catch (err) {
            console.error('Erreur chargement menu public:', err);
        }
    }

    // Affichage des informations de l'établissement
    function renderRestoHeader() {
        if (!restaurantData) return;

        document.title = `${restaurantData.name} — Menu & Commandes en Ligne`;

        // Titre & description
        const restoNameEl = document.getElementById('restoName');
        if (restoNameEl) restoNameEl.textContent = restaurantData.name;

        const restoDescEl = document.getElementById('restoDescription');
        if (restoDescEl && restaurantData.description) {
            restoDescEl.textContent = restaurantData.description;
        }

        // Horaires & Localisation
        const hoursEl = document.getElementById('restoHours');
        if (hoursEl) hoursEl.textContent = restaurantData.opening_hours || '11h30 - 23h30';

        const locEl = document.getElementById('restoLocation');
        if (locEl) locEl.textContent = `${restaurantData.city || 'Cotonou'}, ${restaurantData.country || 'Bénin'}`;

        const addrEl = document.getElementById('restoAddressLine');
        if (addrEl) addrEl.textContent = restaurantData.address || `${restaurantData.city || 'Cotonou'}`;

        // Contact Téléphonique
        const phoneLink = document.getElementById('restoPhoneLink');
        const phoneText = document.getElementById('restoPhoneText');
        if (phoneLink && restaurantData.phone) {
            phoneLink.href = `tel:${restaurantData.phone.replace(/[^0-9+]/g, '')}`;
            if (phoneText) phoneText.textContent = restaurantData.phone;
        }

        // Profil utilisateur
        const userNameEl = document.getElementById('userName');
        const userAvatarEl = document.getElementById('userAvatar');
        const ownerName = restaurantData.owner_name || 'Koffi Mensah';
        if (userNameEl) userNameEl.textContent = ownerName;
        if (userAvatarEl) {
            const initials = ownerName.split(' ').map(n => n.charAt(0)).join('').substring(0, 2).toUpperCase();
            userAvatarEl.textContent = initials || 'KM';
        }

        // Application du thème et branding personnalisé
        if (restaurantData.brand_color) {
            document.documentElement.style.setProperty('--primary-red', restaurantData.brand_color);
            document.documentElement.style.setProperty('--accent-color', restaurantData.brand_color);
            document.documentElement.style.setProperty('--primary', restaurantData.brand_color);
        }

        if (restaurantData.tagline) {
            const headlineSpan = document.querySelector('.hero-headline .text-accent-gradient');
            if (headlineSpan) headlineSpan.textContent = restaurantData.tagline;
        }

        // Photo de bannière et logo
        if (restaurantData.cover_image_url) {
            const heroImg = document.getElementById('heroMainDishImg');
            if (heroImg) heroImg.src = restaurantData.cover_image_url;
        } else if (dishes.length > 0 && dishes[0].image_url) {
            const heroImg = document.getElementById('heroMainDishImg');
            if (heroImg) heroImg.src = dishes[0].image_url;
        }

        // Bouton favori du restaurant
        const restoFavBtn = document.getElementById('restoFavBtn');
        if (restoFavBtn) {
            const isFav = localStorage.getItem(`fav_resto_${restaurantData.id}`) === '1';
            restoFavBtn.style.color = isFav ? '#EF4444' : '#FFF';
            restoFavBtn.onclick = () => {
                const current = localStorage.getItem(`fav_resto_${restaurantData.id}`) === '1';
                localStorage.setItem(`fav_resto_${restaurantData.id}`, current ? '0' : '1');
                restoFavBtn.style.color = !current ? '#EF4444' : '#FFF';
            };
        }
    }

    // Configuration du sélecteur de langue IA
    function setupLanguageSelector() {
        const pills = document.querySelectorAll('#menuLangPills .lang-pill');
        if (!pills || pills.length === 0) return;

        pills.forEach(p => {
            const lang = p.getAttribute('data-lang');
            p.classList.toggle('active', lang === currentLanguage);
        });

        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                const selectedLang = pill.getAttribute('data-lang');
                if (selectedLang === currentLanguage) return;

                currentLanguage = selectedLang;
                localStorage.setItem('menudirect_lang', currentLanguage);

                pills.forEach(p => p.classList.toggle('active', p === pill));

                renderCategoryNav();
                renderDishesCatalogue();
            });
        });
    }

    // Configuration de la recherche en direct
    function setupSearch() {
        const searchInput = document.getElementById('menuSearchInput');
        const clearBtn = document.getElementById('clearSearchBtn');
        if (!searchInput) return;

        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            if (clearBtn) clearBtn.style.display = searchQuery ? 'flex' : 'none';
            renderDishesCatalogue();
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                searchQuery = '';
                clearBtn.style.display = 'none';
                renderDishesCatalogue();
                searchInput.focus();
            });
        }
    }

    // Gestion de la sidebar de navigation
    function setupSidebarNav() {
        const navHomeBtn = document.getElementById('navHomeBtn');
        const navRestoBtn = document.getElementById('navRestoBtn');
        const navCategoriesBtn = document.getElementById('navCategoriesBtn');
        const navOrdersBtn = document.getElementById('navOrdersBtn');
        const navFavoritesBtn = document.getElementById('navFavoritesBtn');

        const navItems = [navHomeBtn, navRestoBtn, navCategoriesBtn, navOrdersBtn, navFavoritesBtn].filter(Boolean);

        function setActiveNav(btn) {
            navItems.forEach(b => b.classList.remove('active'));
            if (btn) btn.classList.add('active');
        }

        navHomeBtn?.addEventListener('click', () => {
            setActiveNav(navHomeBtn);
            isFavoritesFilterActive = false;
            activeCategoryId = 'all';
            updateCategoryActiveUI();
            renderDishesCatalogue();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        navRestoBtn?.addEventListener('click', () => {
            setActiveNav(navRestoBtn);
            document.getElementById('restaurantInfoSection')?.scrollIntoView({ behavior: 'smooth' });
        });

        navCategoriesBtn?.addEventListener('click', () => {
            setActiveNav(navCategoriesBtn);
            document.getElementById('categoriesSection')?.scrollIntoView({ behavior: 'smooth' });
        });

        navOrdersBtn?.addEventListener('click', () => {
            setActiveNav(navOrdersBtn);
            openCheckoutModal();
        });

        navFavoritesBtn?.addEventListener('click', () => {
            setActiveNav(navFavoritesBtn);
            isFavoritesFilterActive = !isFavoritesFilterActive;
            if (!isFavoritesFilterActive) {
                setActiveNav(navHomeBtn);
            }
            renderDishesCatalogue();
            document.getElementById('dishesCatalogSection')?.scrollIntoView({ behavior: 'smooth' });
        });

        // CTA Hero "Commander maintenant"
        document.getElementById('heroOrderBtn')?.addEventListener('click', () => {
            document.getElementById('dishesCatalogSection')?.scrollIntoView({ behavior: 'smooth' });
        });

        // Toggle notifications dropdown
        const notifBtn = document.getElementById('notifBtn');
        const notifWrapper = document.getElementById('notifWrapper');
        notifBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            notifWrapper?.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (notifWrapper && !notifWrapper.contains(e.target)) {
                notifWrapper.classList.remove('open');
            }
        });

        // Voir tout catégories
        document.getElementById('viewAllCatsBtn')?.addEventListener('click', () => {
            activeCategoryId = 'all';
            isFavoritesFilterActive = false;
            updateCategoryActiveUI();
            renderDishesCatalogue();
        });

        // Toggle Sidebar Mobile
        const mobileMenuToggle = document.getElementById('mobileMenuToggle');
        const sidebarLeft = document.getElementById('sidebarLeft');
        mobileMenuToggle?.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebarLeft?.classList.toggle('open');
        });

        document.addEventListener('click', (e) => {
            if (sidebarLeft && sidebarLeft.classList.contains('open') && !sidebarLeft.contains(e.target) && e.target !== mobileMenuToggle) {
                sidebarLeft.classList.remove('open');
            }
        });
    }

    // Barre Catégories Populaires (Horizontal)
    function renderCategoryNav() {
        const nav = document.getElementById('categoriesNavInner');
        if (!nav) return;

        const allLabel = translateCategoryName('Tous');
        let html = `
            <button class="cat-card-item ${activeCategoryId === 'all' && !isFavoritesFilterActive ? 'active' : ''}" data-cat-id="all">
                <div class="cat-icon-bubble">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                </div>
                <span class="cat-title">${escapeHtml(allLabel)}</span>
            </button>
        `;

        categories.forEach(c => {
            const catDishes = dishes.filter(d => d.category_id === c.id);
            if (catDishes.length > 0) {
                const catLabel = translateCategoryName(c.name, c.id);
                const isActive = activeCategoryId === String(c.id) && !isFavoritesFilterActive;
                const icon = CATEGORY_ICONS[c.name] || '🍽️';

                html += `
                    <button class="cat-card-item ${isActive ? 'active' : ''}" data-cat-id="${c.id}">
                        <div class="cat-icon-bubble">${icon}</div>
                        <span class="cat-title">${escapeHtml(catLabel)}</span>
                    </button>
                `;
            }
        });

        nav.innerHTML = html;

        nav.querySelectorAll('.cat-card-item').forEach(btn => {
            btn.addEventListener('click', () => {
                isFavoritesFilterActive = false;
                activeCategoryId = btn.getAttribute('data-cat-id');
                updateCategoryActiveUI();
                renderDishesCatalogue();
            });
        });
    }

    function updateCategoryActiveUI() {
        const nav = document.getElementById('categoriesNavInner');
        if (!nav) return;
        nav.querySelectorAll('.cat-card-item').forEach(b => {
            const id = b.getAttribute('data-cat-id');
            b.classList.toggle('active', !isFavoritesFilterActive && id === String(activeCategoryId));
        });
    }

    // Rendu du Catalogue des Plats
    function renderDishesCatalogue() {
        const container = document.getElementById('menuMainContent');
        const titleEl = document.getElementById('catalogTitle');
        const counterEl = document.getElementById('catalogCounterInfo');
        if (!container) return;

        // Filtrer selon catégorie, recherche et favoris
        let filtered = dishes.filter(d => {
            // Filtre favoris
            if (isFavoritesFilterActive && !favorites.includes(d.id)) {
                return false;
            }

            // Filtre catégorie
            if (!isFavoritesFilterActive && activeCategoryId !== 'all') {
                if (String(d.category_id) !== String(activeCategoryId)) return false;
            }

            // Filtre recherche
            if (searchQuery) {
                const name = (d.name || '').toLowerCase();
                const desc = (d.description || '').toLowerCase();
                if (!name.includes(searchQuery) && !desc.includes(searchQuery)) {
                    return false;
                }
            }

            return true;
        });

        // Mettre à jour les titres de section
        const uiStrings = UI_TRANSLATIONS[currentLanguage] || UI_TRANSLATIONS.fr;
        if (titleEl) {
            if (isFavoritesFilterActive) {
                titleEl.textContent = 'Mes plats favoris ❤️';
            } else if (searchQuery) {
                titleEl.textContent = `Résultats pour "${searchQuery}"`;
            } else if (activeCategoryId !== 'all') {
                const curCat = categories.find(c => String(c.id) === String(activeCategoryId));
                titleEl.textContent = curCat ? translateCategoryName(curCat.name) : uiStrings.popularTitle;
            } else {
                titleEl.textContent = uiStrings.popularTitle;
            }
        }

        if (counterEl) {
            counterEl.textContent = `${filtered.length} plat${filtered.length > 1 ? 's' : ''} disponible${filtered.length > 1 ? 's' : ''}`;
        }

        // Affichage état vide
        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-search-box">
                    <div style="font-size: 2.5rem; margin-bottom: 0.8rem;">🔍</div>
                    <h3 style="color: #FFF; margin-bottom: 0.4rem;">Aucun plat trouvé</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.2rem;">
                        ${isFavoritesFilterActive 
                            ? 'Vous n\'avez pas encore ajouté de plats à vos favoris.' 
                            : 'Aucun plat ne correspond à vos critères de recherche.'}
                    </p>
                    <button class="btn-checkout-primary" style="display: inline-flex; width: auto; margin: 0 auto;" onclick="window.resetCatalogFilters()">
                        Afficher tout le menu
                    </button>
                </div>
            `;
            return;
        }

        // Grille de plats
        container.innerHTML = `
            <div class="dishes-cards-grid">
                ${filtered.map(d => renderSingleDishCard(d, uiStrings)).join('')}
            </div>
        `;
    }

    window.resetCatalogFilters = function () {
        activeCategoryId = 'all';
        isFavoritesFilterActive = false;
        searchQuery = '';
        const searchInput = document.getElementById('menuSearchInput');
        if (searchInput) searchInput.value = '';
        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) clearBtn.style.display = 'none';

        updateCategoryActiveUI();
        renderDishesCatalogue();
    };

    // Rendu d'une carte de plat individuelle
    function renderSingleDishCard(d, uiStrings) {
        const img = d.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80';
        
        let dishName = d.name;
        let dishDesc = d.description || uiStrings.emptyDesc;
        let isTranslated = false;

        if (currentLanguage !== 'fr' && translations.dishes && translations.dishes[d.id] && translations.dishes[d.id][currentLanguage]) {
            const t = translations.dishes[d.id][currentLanguage];
            if (t.name && t.name.trim()) {
                dishName = t.name;
                isTranslated = true;
            }
            if (t.description !== undefined && t.description !== null && t.description.trim()) {
                dishDesc = t.description;
            }
        }

        const badgeHtml = isTranslated 
            ? `<span class="dish-lang-badge" title="Traduction IA">✨ ${currentLanguage.toUpperCase()}</span>` 
            : '';

        const isFav = favorites.includes(d.id);

        return `
            <div class="public-dish-card" id="dish-${d.id}">
                <div class="dish-media-wrap">
                    <img src="${escapeHtml(img)}" alt="${escapeHtml(dishName)}" class="dish-pic" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80'">
                    <div class="dish-rating-badge">
                        <span>⭐</span>
                        <span>4.8</span>
                    </div>
                    <button class="dish-fav-btn ${isFav ? 'is-fav' : ''}" onclick="window.toggleFavorite(${d.id})" aria-label="Favori">
                        <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>
                        </svg>
                    </button>
                </div>
                <div class="dish-content">
                    <h3 class="dish-name">${escapeHtml(dishName)} ${badgeHtml}</h3>
                    <p class="dish-desc">${escapeHtml(dishDesc)}</p>
                    <div class="dish-bottom">
                        <span class="dish-price-tag">${formatFCFA(d.price)}</span>
                        <button class="btn-add-circle" onclick="window.addToCart(${d.id})" title="Ajouter au panier" aria-label="Ajouter au panier">
                            +
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // Gestion des Favoris
    window.toggleFavorite = function (dishId) {
        const index = favorites.indexOf(dishId);
        if (index > -1) {
            favorites.splice(index, 1);
        } else {
            favorites.push(dishId);
        }
        localStorage.setItem('menudirect_favs', JSON.stringify(favorites));

        const badge = document.getElementById('favCountBadge');
        if (badge) {
            badge.textContent = favorites.length;
            badge.style.display = favorites.length > 0 ? 'inline-block' : 'none';
        }

        renderDishesCatalogue();
    };

    function restoreFavorites() {
        try {
            const stored = localStorage.getItem('menudirect_favs');
            if (stored) favorites = JSON.parse(stored);
            const badge = document.getElementById('favCountBadge');
            if (badge && favorites.length > 0) {
                badge.textContent = favorites.length;
                badge.style.display = 'inline-block';
            }
        } catch (e) {}
    }

    // =========================================================================
    // GESTION DU PANIER (Desktop Sidebar + Mobile Drawer)
    // =========================================================================
    window.addToCart = function (dishId) {
        const dish = dishes.find(d => d.id === dishId);
        if (!dish) return;

        const existing = cart.find(item => item.id === dishId);
        if (existing) {
            existing.quantity += 1;
        } else {
            cart.push({
                id: dish.id,
                name: dish.name,
                price: dish.price,
                image_url: dish.image_url,
                quantity: 1
            });
        }

        saveCart();
        updateCartUI();

        // Animation de confirmation
        const badge = document.getElementById('cartCountBadge');
        if (badge) {
            badge.style.transform = 'scale(1.3)';
            setTimeout(() => badge.style.transform = 'scale(1)', 200);
        }
    };

    window.updateCartQty = function (dishId, delta) {
        const item = cart.find(i => i.id === dishId);
        if (!item) return;

        item.quantity += delta;
        if (item.quantity <= 0) {
            cart = cart.filter(i => i.id !== dishId);
        }

        saveCart();
        updateCartUI();
    };

    window.removeFromCart = function (dishId) {
        cart = cart.filter(i => i.id !== dishId);
        saveCart();
        updateCartUI();
    };

    function saveCart() {
        const slug = getSlugFromUrl();
        sessionStorage.setItem(`cart_${slug}`, JSON.stringify(cart));
    }

    function restoreCart() {
        const slug = getSlugFromUrl();
        const stored = sessionStorage.getItem(`cart_${slug}`);
        if (stored) {
            try {
                cart = JSON.parse(stored);
                updateCartUI();
            } catch (e) {}
        }
    }

    function updateCartUI() {
        const totalCount = cart.reduce((sum, i) => sum + i.quantity, 0);
        const subtotal = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const deliveryFee = totalCount > 0 ? DELIVERY_FEE : 0;
        const totalWithDelivery = subtotal + deliveryFee;

        // Badge du panier
        const countBadge = document.getElementById('cartCountBadge');
        if (countBadge) countBadge.textContent = totalCount;

        // Barre Flottante Mobile
        const floatingBar = document.getElementById('cartFloatingBar');
        if (floatingBar) {
            if (totalCount > 0) {
                floatingBar.classList.add('active');
                document.getElementById('cartBarQty').textContent = totalCount;
                document.getElementById('cartBarTotal').textContent = formatFCFA(totalWithDelivery);
            } else {
                floatingBar.classList.remove('active');
            }
        }

        // Totaux financiers Desktop
        const subtotalEl = document.getElementById('cartSubtotalAmount');
        if (subtotalEl) subtotalEl.textContent = formatFCFA(subtotal);

        const deliveryEl = document.getElementById('cartDeliveryFee');
        if (deliveryEl) deliveryEl.textContent = totalCount > 0 ? formatFCFA(deliveryFee) : '0 FCFA';

        const totalEl = document.getElementById('cartDrawerTotal');
        if (totalEl) totalEl.textContent = formatFCFA(totalWithDelivery);

        // Totaux financiers Mobile
        const mobileSubtotalEl = document.getElementById('cartMobileSubtotal');
        if (mobileSubtotalEl) mobileSubtotalEl.textContent = formatFCFA(subtotal);

        const mobileTotalEl = document.getElementById('cartMobileTotal');
        if (mobileTotalEl) mobileTotalEl.textContent = formatFCFA(totalWithDelivery);

        // Bouton Checkout
        const checkoutBtn = document.getElementById('checkoutBtn');
        if (checkoutBtn) checkoutBtn.disabled = totalCount === 0;

        const checkoutMobileBtn = document.getElementById('checkoutMobileBtn');
        if (checkoutMobileBtn) checkoutMobileBtn.disabled = totalCount === 0;

        // Rendu des articles dans le conteneur Desktop
        const container = document.getElementById('cartItemsContainer');
        const mobileContainer = document.getElementById('cartDrawerMobileItems');

        if (cart.length === 0) {
            const emptyHtml = `
                <div class="cart-empty-state">
                    <div class="empty-cart-emoji">🛒</div>
                    <div class="empty-cart-title">Votre panier est vide</div>
                    <p class="empty-cart-desc">Choisissez vos plats favoris dans le menu pour commencer votre commande.</p>
                </div>
            `;
            if (container) container.innerHTML = emptyHtml;
            if (mobileContainer) mobileContainer.innerHTML = emptyHtml;
            return;
        }

        const itemsHtml = cart.map(item => {
            const thumb = item.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=120&q=80';
            return `
                <div class="cart-item-card">
                    <img src="${escapeHtml(thumb)}" alt="${escapeHtml(item.name)}" class="cart-item-thumb" onerror="this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=120&q=80'">
                    <div class="cart-item-details">
                        <div class="cart-item-title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
                        <div class="cart-item-price-unit">${formatFCFA(item.price)}</div>
                    </div>
                    <div class="cart-item-controls">
                        <button class="btn-cart-qty" onclick="window.updateCartQty(${item.id}, -1)">−</button>
                        <span class="cart-qty-num">${item.quantity}</span>
                        <button class="btn-cart-qty" onclick="window.updateCartQty(${item.id}, 1)">+</button>
                    </div>
                    <button class="btn-cart-remove" onclick="window.removeFromCart(${item.id})" title="Supprimer">✕</button>
                </div>
            `;
        }).join('');

        if (container) container.innerHTML = itemsHtml;
        if (mobileContainer) mobileContainer.innerHTML = itemsHtml;
    }

    // =========================================================================
    // MODAL CHECKOUT & COMMANDE
    // =========================================================================
    function openCheckoutModal() {
        if (cart.length === 0) return;

        const subtotal = cart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const total = subtotal + DELIVERY_FEE;

        const totalAmountEl = document.getElementById('checkoutTotalAmount');
        if (totalAmountEl) totalAmountEl.textContent = formatFCFA(total);

        // Restaurer coordonnées déjà saisies
        const savedName = localStorage.getItem('md_client_name');
        const savedPhone = localStorage.getItem('md_client_phone');
        const savedAddr = localStorage.getItem('md_client_address');

        if (savedName) document.getElementById('custName').value = savedName;
        if (savedPhone) document.getElementById('custPhone').value = savedPhone;
        if (savedAddr) document.getElementById('custAddress').value = savedAddr;

        document.getElementById('checkoutFormContainer').style.display = 'block';
        document.getElementById('checkoutSuccessContainer').style.display = 'none';
        document.getElementById('checkoutAlert').className = 'auth-alert';

        document.getElementById('cartDrawerOverlay')?.classList.remove('open');
        document.getElementById('checkoutModalOverlay')?.classList.add('open');
    }

    // Événements d'ouverture Checkout
    document.getElementById('checkoutBtn')?.addEventListener('click', openCheckoutModal);
    document.getElementById('checkoutMobileBtn')?.addEventListener('click', openCheckoutModal);

    // Événements Tiroir Panier Mobile
    const drawerOverlay = document.getElementById('cartDrawerOverlay');
    document.getElementById('cartFloatingBar')?.addEventListener('click', () => {
        drawerOverlay?.classList.add('open');
    });

    document.getElementById('closeCartDrawerBtn')?.addEventListener('click', () => {
        drawerOverlay?.classList.remove('open');
    });

    drawerOverlay?.addEventListener('click', (e) => {
        if (e.target === drawerOverlay) drawerOverlay.classList.remove('open');
    });

    // Fermeture Modal Checkout
    const checkoutModal = document.getElementById('checkoutModalOverlay');
    document.getElementById('closeCheckoutModalBtn')?.addEventListener('click', () => {
        checkoutModal?.classList.remove('open');
    });

    checkoutModal?.addEventListener('click', (e) => {
        if (e.target === checkoutModal) checkoutModal.classList.remove('open');
    });

    // Soumission du Formulaire de Commande
    document.getElementById('orderForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const alertBox = document.getElementById('checkoutAlert');
        alertBox.className = 'auth-alert';

        const name = document.getElementById('custName').value.trim();
        const phone = document.getElementById('custPhone').value.trim();
        const address = document.getElementById('custAddress').value.trim();
        const paymentMethod = document.getElementById('custPaymentMethod').value;
        const notes = document.getElementById('custNotes').value.trim();

        if (!name || !phone) {
            alertBox.textContent = 'Veuillez saisir votre nom et votre numéro de téléphone.';
            alertBox.className = 'auth-alert show auth-alert-error';
            return;
        }

        const submitBtn = document.getElementById('submitOrderBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Transmission de la commande...</span>';

        // Sauvegarder pour les prochaines commandes
        localStorage.setItem('md_client_name', name);
        localStorage.setItem('md_client_phone', phone);
        if (address) localStorage.setItem('md_client_address', address);

        const slug = getSlugFromUrl();

        try {
            const res = await fetch(`/api/public/${slug}/order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customer_name: name,
                    customer_phone: phone,
                    customer_address: address,
                    payment_method: paymentMethod,
                    notes,
                    items: cart
                })
            });

            const data = await res.json();

            if (!res.ok) {
                alertBox.textContent = data.error || 'Erreur lors de la validation.';
                alertBox.className = 'auth-alert show auth-alert-error';
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<span>Confirmer et envoyer la commande</span> <span>✓</span>';
                return;
            }

            // Réussite
            const orderInfo = data.order;
            document.getElementById('confirmedOrderNumber').textContent = orderInfo.order_number;
            document.getElementById('confirmedOrderTotalText').innerHTML = `Montant de la commande : <strong>${formatFCFA(orderInfo.total_amount)}</strong>`;

            // Préparation du message WhatsApp pré-formaté
            const restoCleanPhone = (orderInfo.restaurant_phone || '').replace(/[^0-9+]/g, '');
            const cartSummary = cart.map(it => `• ${it.quantity}x ${it.name}`).join('\n');
            const waText = encodeURIComponent(
                `Bonjour ${orderInfo.restaurant_name} ! Je viens de passer la commande *${orderInfo.order_number}* pour un total de *${formatFCFA(orderInfo.total_amount)}*.\n\nArticles commandés :\n${cartSummary}\n\nClient : ${name}\nTéléphone : ${phone}\nAdresse : ${address || 'Sur place / À emporter'}`
            );
            document.getElementById('confirmedWhatsappBtn').href = `https://wa.me/${restoCleanPhone.replace('+', '')}?text=${waText}`;

            // Réinitialiser le panier
            cart = [];
            saveCart();
            updateCartUI();

            // Basculer l'affichage du modal
            document.getElementById('checkoutFormContainer').style.display = 'none';
            document.getElementById('checkoutSuccessContainer').style.display = 'block';

            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Confirmer et envoyer la commande</span> <span>✓</span>';

        } catch (err) {
            alertBox.textContent = 'Impossible de contacter le restaurant. Vérifiez votre connexion.';
            alertBox.className = 'auth-alert show auth-alert-error';
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Confirmer et envoyer la commande</span> <span>✓</span>';
        }
    });

    document.getElementById('closeAllAndResetBtn')?.addEventListener('click', () => {
        checkoutModal?.classList.remove('open');
    });

    document.addEventListener('DOMContentLoaded', loadPublicMenu);
})();
