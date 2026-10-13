/**
 * MenuDirect SaaS — Logique Interactive du Dashboard Restaurateur
 */

(function () {
    let currentResto = null;
    let categoriesList = [];
    let dishesList = [];
    let ordersList = [];
    let lastKnownOrderId = 0;
    let currentOrderFilter = 'all';
    let pollingInterval = null;
    let analyticsPeriod = 'today';

    // Synthétiseur audio pour signal sonore lors d'une nouvelle commande (sans fichier externe)
    function playOrderChime() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            
            const now = ctx.currentTime;
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now); // D5
            osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
            
            gain1.gain.setValueAtTime(0.3, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            
            osc1.start(now);
            osc1.stop(now + 0.4);
        } catch (e) {
            console.log('Audio chime non autorisé avant interaction utilisateur.');
        }
    }

    // Afficher une notification Toast
    function showOrderToast(title, message) {
        const toast = document.getElementById('orderToast');
        if (!toast) return;
        document.getElementById('toastTitle').textContent = title;
        document.getElementById('toastMessage').textContent = message;
        toast.classList.add('show');
        playOrderChime();
        setTimeout(() => {
            toast.classList.remove('show');
        }, 6000);
    }

    // Formatage des montants en FCFA
    function formatFCFA(amount) {
        return new Intl.NumberFormat('fr-FR').format(amount || 0) + ' FCFA';
    }

    // Formatage de date
    function formatDate(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // Initialisation
    async function initDashboard() {
        try {
            const res = await fetch('/api/auth/me');
            if (!res.ok) {
                window.location.href = '/login';
                return;
            }
            const data = await res.json();
            if (!data.authenticated || !data.restaurant) {
                window.location.href = '/login';
                return;
            }

            currentResto = data.restaurant;
            setupRestoUI();

            // Charger les données
            await Promise.all([
                loadStats(),
                loadOrders(),
                loadMenu(),
                loadCategories(),
                loadCustomers(),
                loadPayments()
            ]);

            // Démarrer polling temps réel toutes les 5 secondes
            pollingInterval = setInterval(checkLiveUpdates, 5000);

        } catch (err) {
            console.error('Erreur chargement dashboard:', err);
            window.location.href = '/login';
        }
    }

    // Configuration de l'interface restaurant
    function setupRestoUI() {
        document.getElementById('sidebarRestoName').textContent = currentResto.name;
        document.getElementById('sidebarPlanBadge').textContent = (currentResto.subscription_plan || 'standard').toUpperCase();

        const avatar = document.getElementById('sidebarAvatar');
        if (currentResto.logo_url) {
            avatar.innerHTML = `<img src="${currentResto.logo_url}" alt="${currentResto.name}">`;
        } else {
            avatar.textContent = (currentResto.name || 'R').charAt(0).toUpperCase();
        }

        // Lien menu public
        const publicUrl = `/${currentResto.slug}`;
        const viewBtn = document.getElementById('viewPublicMenuBtn');
        if (viewBtn) {
            viewBtn.href = publicUrl;
        }
        const topbarMenu = document.getElementById('topbarPublicMenuBtn');
        if (topbarMenu) topbarMenu.href = publicUrl;
        const fullPublicUrl = `${window.location.origin}${publicUrl}`;
        const publicUrlText = document.getElementById('publicMenuUrl');
        if (publicUrlText) publicUrlText.textContent = fullPublicUrl;
        const openPublicMenuBtn = document.getElementById('openPublicMenuBtn');
        if (openPublicMenuBtn) openPublicMenuBtn.href = publicUrl;
        const profileResto = document.getElementById('profileRestaurantName');
        if (profileResto) profileResto.textContent = currentResto.name;
        const profilePlanEl = document.getElementById('profilePlan');
        if (profilePlanEl) profilePlanEl.textContent = (currentResto.subscription_plan || 'standard').toUpperCase();
        const topbarAvatar = document.getElementById('topbarAvatar') || document.getElementById('topbarAvatarText');
        if (topbarAvatar) {
            if (currentResto.logo_url) topbarAvatar.innerHTML = `<img src="${currentResto.logo_url}" alt="">`;
            else topbarAvatar.textContent = (currentResto.name || 'R').charAt(0).toUpperCase();
        }

        // Pré-remplir les paramètres
        populateSettingsForm();

        // Mettre à jour la fiche restaurant et la topbar
        const welcomeUser = document.getElementById('welcomeUserName');
        if (welcomeUser) welcomeUser.textContent = currentResto.name || 'Admin';
        const topbarAdmin = document.getElementById('topbarAdminName');
        if (topbarAdmin) topbarAdmin.textContent = currentResto.name || 'Admin';
        const topbarAvatarImg = document.getElementById('topbarAvatarImg');
        if (topbarAvatarImg && currentResto.logo_url) {
            topbarAvatarImg.src = currentResto.logo_url;
        }

        // Fiche restaurant de la colonne latérale
        const restoCardName = document.getElementById('restoCardName');
        if (restoCardName) restoCardName.textContent = currentResto.name;
        const restoCardPhone = document.getElementById('restoCardPhone');
        if (restoCardPhone) restoCardPhone.textContent = currentResto.phone || 'Non renseigné';
        const restoCardEmail = document.getElementById('restoCardEmail');
        if (restoCardEmail) restoCardEmail.textContent = currentResto.email || '';
        const restoCardAddress = document.getElementById('restoCardAddress');
        if (restoCardAddress) restoCardAddress.textContent = currentResto.address || (currentResto.city ? `${currentResto.city}, ${currentResto.country || 'Bénin'}` : 'Cotonou, Bénin');
        const publicMenuUrlInput = document.getElementById('publicMenuUrlInput');
        if (publicMenuUrlInput) publicMenuUrlInput.value = fullPublicUrl;

        updateLiveClock();
        setInterval(updateLiveClock, 30000);
    }

    function updateLiveClock() {
        const clockEl = document.getElementById('liveDateTimeText');
        if (!clockEl) return;
        const now = new Date();
        const optionsDate = { day: '2-digit', month: 'long', year: 'numeric' };
        const rawDate = now.toLocaleDateString('fr-FR', optionsDate);
        const parts = rawDate.split(' ');
        if (parts.length >= 3) {
            parts[1] = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
            clockEl.textContent = parts.join(' ');
        } else {
            clockEl.textContent = rawDate;
        }
    }

    // Changement de vue (onglets de navigation)
    window.switchView = function (viewName) {
        const viewTitles = {
            dashboard: 'Tableau de bord',
            orders: 'Gestion des commandes',
            menu: 'Gestion du menu',
            translations: 'Traduction de Carte par IA Culinaire',
            minisite: 'Mini-Site & Domaine Professionnel',
            categories: 'Catégories',
            customers: 'Répertoire des clients',
            payments: 'Suivi des paiements',
            stats: 'Statistiques de vente',
            settings: 'Paramètres du restaurant'
        };

        document.getElementById('topbarTitle').textContent = viewTitles[viewName] || 'Tableau de bord';

        document.querySelectorAll('.dash-nav .nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
        });

        document.querySelectorAll('.view-section').forEach(sec => {
            sec.classList.remove('active');
        });

        const target = document.getElementById(`view-${viewName}`);
        if (target) {
            target.classList.add('active');
        }

        // Déclencher le chargement des données spécifiques aux nouvelles fonctionnalités
        if (viewName === 'translations' && typeof window.loadTranslationsStudio === 'function') {
            window.loadTranslationsStudio();
        } else if (viewName === 'minisite' && typeof window.loadMinisiteStudio === 'function') {
            window.loadMinisiteStudio();
        }

        // Fermer la sidebar sur mobile
        document.getElementById('dashSidebar')?.classList.remove('open');
        document.getElementById('dashSidebarOverlay')?.classList.remove('active');
    };

    // Vérification en direct des nouvelles commandes (polling)
    async function checkLiveUpdates() {
        try {
            const res = await fetch(`/api/orders/stats?period=${analyticsPeriod}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.success && data.stats) {
                updateStatsUI(data.stats);

                // Vérifier s'il y a une nouvelle commande
                if (data.recent_orders && data.recent_orders.length > 0) {
                    const newest = data.recent_orders[0];
                    if (lastKnownOrderId > 0 && newest.id > lastKnownOrderId && newest.status === 'nouvelle') {
                        showOrderToast(
                            `Nouvelle commande #${newest.order_number}`,
                            `${newest.customer_name} • ${formatFCFA(newest.total_amount)}`
                        );
                        loadOrders();
                    }
                    lastKnownOrderId = Math.max(lastKnownOrderId, newest.id);
                }
            }
        } catch (err) {
            // Ignorer silencieusement pour le polling
        }
    }

    // 1. STATS
    async function loadStats() {
        try {
            const res = await fetch(`/api/orders/stats?period=${analyticsPeriod}`);
            const data = await res.json();
            if (data.success) {
                updateStatsUI(data.stats);
                renderRecentOrders(data.recent_orders || []);
                renderAnalytics(data.analytics);
                if (data.recent_orders && data.recent_orders.length > 0) {
                    lastKnownOrderId = data.recent_orders[0].id;
                }
            }
        } catch (err) {
            console.error('Erreur stats:', err);
        }
    }

    function updateStatsUI(stats) {
        document.getElementById('statOrdersToday').textContent = stats.orders_today || 0;
        document.getElementById('statPendingOrders').textContent = stats.pending_orders || 0;
        document.getElementById('statPreparingOrders').textContent = stats.preparing_orders || 0;
        document.getElementById('statCompletedOrders').textContent = stats.completed_orders || 0;
        document.getElementById('statRevenueToday').textContent = formatFCFA(stats.revenue_today || 0);
        const quickNew = document.getElementById('quickNewCount');
        const quickPrep = document.getElementById('quickPrepCount');
        const quickReady = document.getElementById('quickReadyCount');
        if (quickNew) quickNew.textContent = stats.pending_orders || 0;
        if (quickPrep) quickPrep.textContent = stats.preparing_orders || 0;
        if (quickReady) quickReady.textContent = stats.ready_orders || 0;

        // Badge sidebar
        const badge = document.getElementById('navOrdersBadge');
        if (stats.pending_orders > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = stats.pending_orders;
        } else {
            badge.style.display = 'none';
        }

        // Stats globales
        const statTotalRev = document.getElementById('statsTotalRevenue');
        if (statTotalRev) statTotalRev.textContent = formatFCFA(stats.total_revenue || 0);
        const statTotalOrd = document.getElementById('statsTotalOrders');
        if (statTotalOrd) statTotalOrd.textContent = stats.total_orders || 0;
        const statAvg = document.getElementById('statsAverageBasket');
        if (statAvg) {
            const avg = stats.total_orders > 0 ? Math.round(stats.total_revenue / stats.total_orders) : 0;
            statAvg.textContent = formatFCFA(avg);
        }
    }

    function renderAnalytics(analytics) {
        const chart = document.getElementById('salesChart');
        const list = document.getElementById('topProductsList');
        if (!chart || !list || !analytics) return;
        const sales = analytics.sales_by_day || [];
        const maxRevenue = Math.max(...sales.map(item => Number(item.revenue) || 0), 1);
        const revenue = sales.reduce((total, item) => total + (Number(item.revenue) || 0), 0);
        document.getElementById('chartRevenue').textContent = formatFCFA(revenue);
        chart.innerHTML = sales.length ? sales.map(item => {
            const label = analytics.period === 'today' ? 'Aujourd’hui' : new Date(`${item.day}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
            return `<div class="bar-column" title="${item.orders} commande(s), ${formatFCFA(item.revenue)}"><i style="height:${Math.max(7, Math.round((item.revenue / maxRevenue) * 100))}%"></i><small>${label}</small></div>`;
        }).join('') : '<p class="empty-state">Aucune vente sur cette période.</p>';
        const products = analytics.top_products || [];
        list.innerHTML = products.length ? products.map(product => `<li><span>${product.name}</span><strong>${product.quantity} ×</strong></li>`).join('') : '<li class="empty-state">Pas encore de ventes sur cette période.</li>';
    }

    window.openOrderFilter = function (filter) {
        window.switchView('orders');
        const target = document.querySelector(`[data-order-filter="${filter}"]`);
        if (target) target.click();
    };

    window.openAddDish = function () {
        window.switchView('menu');
        document.getElementById('addDishBtn')?.click();
    };

    function renderRecentOrders(orders) {
        const tbody = document.getElementById('recentOrdersTableBody');
        if (!tbody) return;

        if (!orders || orders.length === 0) {
            return;
        }

        tbody.innerHTML = orders.map(o => {
            const itemsSummary = o.items ? o.items.map(i => `${i.quantity > 1 ? i.quantity + 'x ' : ''}${i.dish_name}`).join(' + ') : 'Plats variés';
            const timeStr = o.created_at ? new Date(o.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '12:00';
            
            let statusPill = '<span class="status-pill status-pill-prep">En préparation</span>';
            if (o.status === 'terminee' || o.status === 'prete' || o.status === 'livre') {
                statusPill = '<span class="status-pill status-pill-delivered">Livré</span>';
            } else if (o.status === 'en_livraison') {
                statusPill = '<span class="status-pill status-pill-delivery">En livraison</span>';
            } else if (o.status === 'en_preparation') {
                statusPill = '<span class="status-pill status-pill-prep">En préparation</span>';
            }

            const rawNum = String(o.order_number || '');
            const displayId = rawNum.startsWith('#') ? rawNum : '#' + (rawNum.replace(/^CMD-\d{4}-/, '') || rawNum);

            return `
                <tr>
                    <td class="order-id-cell" title="${rawNum}">${displayId}</td>
                    <td class="customer-cell">${o.customer_name || 'Client invité'}</td>
                    <td class="dish-cell" title="${itemsSummary}">${itemsSummary}</td>
                    <td class="amount-cell">${formatFCFA(o.total_amount)}</td>
                    <td>${statusPill}</td>
                    <td class="time-cell">${timeStr}</td>
                    <td class="actions-cell">
                        <button class="btn-dots-more" onclick="window.switchView('orders')" title="Gérer la commande">•••</button>
                    </td>
                </tr>
            `;
        }).join('');

        // Mettre à jour la mini-liste de la colonne de droite si des commandes sont présentes
        const miniList = document.getElementById('recentOrdersMiniList');
        if (miniList && orders && orders.length > 0) {
            miniList.innerHTML = orders.slice(0, 5).map(o => {
                const itemsSummary = o.items ? o.items.map(i => `${i.quantity}x ${i.dish_name}`).join(', ') : 'Commande';
                const timeStr = o.created_at ? new Date(o.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '12:00';
                const isDelivered = o.status === 'terminee' || o.status === 'prete';
                const pillClass = isDelivered ? 'status-pill-green' : 'status-pill-amber';
                const pillLabel = isDelivered ? 'Livrée' : 'En cours';
                return `
                    <div class="recent-order-item">
                        <div class="order-cat-circle">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2"/><path d="M15 2v19"/><path d="M9 2v4a2 2 0 0 1-2 2 2 2 0 0 1-2-2V2"/><path d="M7 2v19"/></svg>
                        </div>
                        <div class="order-details-col">
                            <strong>#${o.order_number}</strong>
                            <p>${itemsSummary}</p>
                            <small>${timeStr}</small>
                        </div>
                        <span class="${pillClass}">${pillLabel}</span>
                    </div>
                `;
            }).join('');
        }
    }

    function getStatusLabel(status) {
        const labels = {
            nouvelle: 'Nouvelle',
            acceptee: 'Acceptée',
            en_preparation: 'En cuisine',
            prete: 'Prête',
            terminee: 'Terminée',
            annulee: 'Annulée'
        };
        return labels[status] || status;
    }

    // 2. COMMANDES
    async function loadOrders() {
        try {
            const res = await fetch('/api/orders');
            const data = await res.json();
            if (data.success) {
                ordersList = data.orders || [];
                renderOrdersGrid();
                updateOrderFiltersCount();
            }
        } catch (err) {
            console.error('Erreur chargement commandes:', err);
        }
    }

    function updateOrderFiltersCount() {
        const countAll = ordersList.length;
        const countNew = ordersList.filter(o => o.status === 'nouvelle').length;
        const countPrep = ordersList.filter(o => o.status === 'en_preparation' || o.status === 'acceptee').length;
        const countReady = ordersList.filter(o => o.status === 'prete').length;

        document.getElementById('countFilterAll').textContent = countAll;
        document.getElementById('countFilterNew').textContent = countNew;
        document.getElementById('countFilterPrep').textContent = countPrep;
        document.getElementById('countFilterReady').textContent = countReady;
    }

    function renderOrdersGrid() {
        const container = document.getElementById('ordersCardsContainer');
        if (!container) return;

        let filtered = ordersList;
        if (currentOrderFilter !== 'all') {
            if (currentOrderFilter === 'en_preparation') {
                filtered = ordersList.filter(o => o.status === 'en_preparation' || o.status === 'acceptee');
            } else {
                filtered = ordersList.filter(o => o.status === currentOrderFilter);
            }
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: var(--dash-text-muted);">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🛎️</div>
                    <h3>Aucune commande dans cette catégorie</h3>
                    <p style="font-size: 0.9rem; margin-top: 0.5rem;">Les nouvelles commandes passeront ici en direct.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(o => {
            const itemsHtml = (o.items || []).map(it => `
                <div class="order-item-row">
                    <span class="order-item-name"><span class="order-item-qty">${it.quantity}x</span>${it.dish_name}</span>
                    <span>${formatFCFA(it.subtotal)}</span>
                </div>
            `).join('');

            const cleanPhone = o.customer_phone.replace(/[^0-9+]/g, '');
            const waMsg = encodeURIComponent(`Bonjour ${o.customer_name}, c'est ${currentResto.name} concernant votre commande ${o.order_number}.`);
            const waLink = `https://wa.me/${cleanPhone.replace('+', '')}?text=${waMsg}`;

            // Boutons de changement de statut
            let actionButtons = '';
            if (o.status === 'nouvelle') {
                actionButtons = `
                    <button class="btn-action btn-action-primary" onclick="window.updateOrderStatus(${o.id}, 'acceptee')">Accepter</button>
                    <button class="btn-action btn-action-danger" onclick="window.updateOrderStatus(${o.id}, 'annulee')">Refuser</button>
                `;
            } else if (o.status === 'acceptee') {
                actionButtons = `
                    <button class="btn-action btn-action-primary" onclick="window.updateOrderStatus(${o.id}, 'en_preparation')">Mettre en cuisine</button>
                    <button class="btn-action btn-action-danger" onclick="window.updateOrderStatus(${o.id}, 'annulee')">Annuler</button>
                `;
            } else if (o.status === 'en_preparation') {
                actionButtons = `
                    <button class="btn-action btn-action-success" onclick="window.updateOrderStatus(${o.id}, 'prete')">Marquer prête ✅</button>
                    <button class="btn-action btn-action-danger" onclick="window.updateOrderStatus(${o.id}, 'annulee')">Annuler</button>
                `;
            } else if (o.status === 'prete') {
                actionButtons = `
                    <button class="btn-action btn-action-success" onclick="window.updateOrderStatus(${o.id}, 'terminee')">Terminer & Livré 🎉</button>
                `;
            }

            return `
                <div class="order-card">
                    <div class="order-card-header">
                        <div>
                            <div class="order-number">${o.order_number}</div>
                            <div class="order-time">${formatDate(o.created_at)}</div>
                        </div>
                        <span class="badge-status status-${o.status}">${getStatusLabel(o.status)}</span>
                    </div>

                    <div class="order-customer">
                        <div class="order-customer-name">${o.customer_name}</div>
                        <div class="order-customer-contact">
                            <a href="tel:${cleanPhone}" class="order-contact-btn">📞 ${o.customer_phone}</a>
                            <a href="${waLink}" target="_blank" class="order-contact-btn" style="color: #34D399;">💬 WhatsApp</a>
                        </div>
                        ${o.customer_address ? `<div style="font-size: 0.8rem; color: var(--dash-text-muted); margin-top: 0.2rem;">📍 ${o.customer_address}</div>` : ''}
                        ${o.notes ? `<div style="font-size: 0.8rem; color: #FBBF24; margin-top: 0.2rem;">📝 Note: ${o.notes}</div>` : ''}
                    </div>

                    <div class="order-items-list">
                        ${itemsHtml}
                    </div>

                    <div class="order-total-bar">
                        <span style="font-size: 0.85rem; color: var(--dash-text-muted);">Total</span>
                        <span class="order-total-amount">${formatFCFA(o.total_amount)}</span>
                    </div>

                    ${actionButtons ? `<div class="order-actions-bar">${actionButtons}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    // Changement de statut d'une commande
    window.updateOrderStatus = async function (orderId, newStatus) {
        try {
            const res = await fetch(`/api/orders/${orderId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });

            if (!res.ok) {
                alert('Erreur lors du changement de statut.');
                return;
            }

            await loadOrders();
            await loadStats();
        } catch (err) {
            console.error('Erreur statut:', err);
            alert('Impossible de contacter le serveur.');
        }
    };

    // 3. MENU & PLATS
    async function loadMenu() {
        try {
            const res = await fetch('/api/menu/dishes');
            const data = await res.json();
            if (data.success) {
                dishesList = data.dishes || [];
                renderDishesGrid();
            }
        } catch (err) {
            console.error('Erreur chargement menu:', err);
        }
    }

    function renderDishesGrid() {
        const container = document.getElementById('dishesGridContainer');
        if (!container) return;

        const catFilter = document.getElementById('menuCatFilter').value;
        let filtered = dishesList;
        if (catFilter !== 'all') {
            filtered = dishesList.filter(d => String(d.category_id) === String(catFilter));
        }

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; color: var(--dash-text-muted);">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">🍽️</div>
                    <h3>Aucun plat dans cette sélection</h3>
                    <p style="font-size: 0.9rem; margin-top: 0.5rem;">Cliquez sur "+ Ajouter un plat" pour enrichir votre carte.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(d => {
            const img = d.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80';
            const statusBadge = d.is_active
                ? `<span class="badge-status status-prete">Disponible</span>`
                : `<span class="badge-status status-annulee">Épuisé</span>`;

            return `
                <div class="dish-card">
                    <div class="dish-image-wrapper">
                        <img src="${img}" alt="${d.name}" class="dish-image">
                        <div class="dish-badge-status">${statusBadge}</div>
                    </div>
                    <div class="dish-body">
                        <div class="dish-category">${d.category_name || 'Général'}</div>
                        <h4 class="dish-title">${d.name}</h4>
                        <p class="dish-desc">${d.description || 'Aucune description fournie.'}</p>
                        <div class="dish-footer">
                            <span class="dish-price">${formatFCFA(d.price)}</span>
                            <div class="dish-actions">
                                <button class="btn-action btn-action-ai" onclick="window.openTranslateModalForDish(${d.id})" title="Traduire ce plat avec Google Gemini">✨ Gemini</button>
                                <button class="btn-action" onclick="window.toggleDishActive(${d.id})" title="${d.is_active ? 'Marquer épuisé' : 'Rendre disponible'}">
                                    ${d.is_active ? '👁️' : '🚫'}
                                </button>
                                <button class="btn-action" onclick="window.editDish(${d.id})" title="Modifier">✏️</button>
                                <button class="btn-action btn-action-danger" onclick="window.deleteDish(${d.id})" title="Supprimer">🗑️</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Toggle Plat Actif / Épuisé
    window.toggleDishActive = async function (dishId) {
        try {
            const res = await fetch(`/api/menu/dishes/${dishId}/toggle-active`, { method: 'PATCH' });
            if (res.ok) {
                await loadMenu();
            }
        } catch (err) {
            console.error('Erreur toggle plat:', err);
        }
    };

    // Supprimer un plat
    window.deleteDish = async function (dishId) {
        if (!confirm('Êtes-vous sûr de vouloir retirer ce plat du menu ?')) return;
        try {
            const res = await fetch(`/api/menu/dishes/${dishId}`, { method: 'DELETE' });
            if (res.ok) {
                await loadMenu();
            }
        } catch (err) {
            console.error('Erreur suppression plat:', err);
        }
    };

    // 4. CATÉGORIES
    async function loadCategories() {
        try {
            const res = await fetch('/api/menu/categories');
            const data = await res.json();
            if (data.success) {
                categoriesList = data.categories || [];
                renderCategoriesTable();
                populateCategorySelects();
            }
        } catch (err) {
            console.error('Erreur catégories:', err);
        }
    }

    function renderCategoriesTable() {
        const tbody = document.getElementById('categoriesTableBody');
        if (!tbody) return;

        if (categoriesList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--dash-text-muted); padding: 2rem;">Aucune catégorie. Créez-en une pour structurer votre menu !</td></tr>`;
            return;
        }

        tbody.innerHTML = categoriesList.map(c => `
            <tr>
                <td><strong>${c.name}</strong></td>
                <td><span style="font-family: var(--font-mono);">${c.display_order}</span></td>
                <td>${c.dishes_count || 0} plat(s)</td>
                <td>
                    <button class="btn-action" onclick="window.editCategory(${c.id}, '${c.name.replace(/'/g, "\\'")}', ${c.display_order})">✏️</button>
                    <button class="btn-action btn-action-danger" onclick="window.deleteCategory(${c.id})">🗑️</button>
                </td>
            </tr>
        `).join('');
    }

    function populateCategorySelects() {
        const dishCatSelect = document.getElementById('dishCategorySelect');
        const filterSelect = document.getElementById('menuCatFilter');

        if (dishCatSelect) {
            dishCatSelect.innerHTML = '<option value="">Sans catégorie</option>' +
                categoriesList.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }

        if (filterSelect) {
            const currentVal = filterSelect.value;
            filterSelect.innerHTML = '<option value="all">Toutes les catégories</option>' +
                categoriesList.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            filterSelect.value = currentVal;
        }
    }

    window.deleteCategory = async function (catId) {
        if (!confirm('Supprimer cette catégorie ? Les plats associés ne seront pas supprimés mais n\'auront plus de catégorie.')) return;
        try {
            const res = await fetch(`/api/menu/categories/${catId}`, { method: 'DELETE' });
            if (res.ok) {
                await loadCategories();
                await loadMenu();
            }
        } catch (err) {
            console.error('Erreur suppression catégorie:', err);
        }
    };

    // 5. CLIENTS
    async function loadCustomers() {
        try {
            const res = await fetch('/api/customers');
            const data = await res.json();
            if (data.success) {
                const customers = data.customers || [];
                const label = document.getElementById('customersCountLabel');
                if (label) label.textContent = `${customers.length} client(s) répertorié(s)`;

                const tbody = document.getElementById('customersTableBody');
                if (tbody) {
                    if (customers.length === 0) {
                        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--dash-text-muted); padding: 2rem;">Aucun client enregistré pour l'instant.</td></tr>`;
                    } else {
                        tbody.innerHTML = customers.map(c => `
                            <tr>
                                <td><strong>${c.name}</strong></td>
                                <td><a href="tel:${c.phone}" style="color: #60A5FA; text-decoration: none;">📞 ${c.phone}</a></td>
                                <td>${c.address || '—'}</td>
                                <td><span style="font-weight: 700;">${c.orders_count || 1}</span> commande(s)</td>
                                <td><strong>${formatFCFA(c.total_spent)}</strong></td>
                                <td>${formatDate(c.last_order_at)}</td>
                            </tr>
                        `).join('');
                    }
                }
            }
        } catch (err) {
            console.error('Erreur clients:', err);
        }
    }

    // 6. PAIEMENTS
    async function loadPayments() {
        try {
            const res = await fetch('/api/payments');
            const data = await res.json();
            if (data.success) {
                const payments = data.payments || [];
                document.getElementById('paidAmountLabel').textContent = formatFCFA(data.stats?.paid_amount || 0);
                document.getElementById('pendingAmountLabel').textContent = formatFCFA(data.stats?.pending_amount || 0);

                const tbody = document.getElementById('paymentsTableBody');
                if (tbody) {
                    if (payments.length === 0) {
                        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--dash-text-muted); padding: 2rem;">Aucune transaction enregistrée.</td></tr>`;
                    } else {
                        tbody.innerHTML = payments.map(p => `
                            <tr>
                                <td><strong>${p.order_number}</strong></td>
                                <td>${p.customer_name}<br><span style="font-size: 0.75rem; color: var(--dash-text-muted);">${p.customer_phone}</span></td>
                                <td><strong>${formatFCFA(p.amount)}</strong></td>
                                <td>${p.payment_method === 'mobile_money' ? '📱 Mobile Money' : '💵 Espèces'}</td>
                                <td><span class="badge-status status-${p.status === 'paye' ? 'prete' : 'en_preparation'}">${p.status === 'paye' ? 'Payé' : 'En attente'}</span></td>
                                <td>${formatDate(p.created_at)}</td>
                            </tr>
                        `).join('');
                    }
                }
            }
        } catch (err) {
            console.error('Erreur paiements:', err);
        }
    }

    // 7. PARAMÈTRES & ABONNEMENT
    function populateSettingsForm() {
        if (!currentResto) return;
        document.getElementById('setRestoName').value = currentResto.name || '';
        document.getElementById('setOwnerName').value = currentResto.owner_name || '';
        document.getElementById('setPhone').value = currentResto.phone || '';
        document.getElementById('setEmail').value = currentResto.email || '';
        document.getElementById('setCity').value = currentResto.city || '';
        document.getElementById('setCountry').value = currentResto.country || '';
        document.getElementById('setAddress').value = currentResto.address || '';
        document.getElementById('setOpeningHours').value = currentResto.opening_hours || '';
        document.getElementById('setDescription').value = currentResto.description || '';
        document.getElementById('setLogoUrl').value = currentResto.logo_url || '';

        // Marquer la formule active
        const plan = (currentResto.subscription_plan || 'standard').toLowerCase();
        document.querySelectorAll('.sub-plan-card').forEach(c => c.classList.remove('current'));
        const activeCard = document.getElementById(`planCard-${plan}`);
        if (activeCard) activeCard.classList.add('current');
    }

    window.changeSubscription = async function (newPlan) {
        if (!confirm(`Confirmer le passage à la formule ${newPlan.toUpperCase()} ?`)) return;
        try {
            const res = await fetch('/api/settings/subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: newPlan })
            });
            const data = await res.json();
            if (res.ok) {
                alert(data.message || 'Formule mise à jour !');
                currentResto.subscription_plan = newPlan;
                setupRestoUI();
            } else {
                alert(data.error || 'Erreur lors du changement de formule.');
            }
        } catch (err) {
            alert('Impossible de contacter le serveur.');
        }
    };

    // Formulaire de profil
    document.getElementById('settingsProfileForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('name', document.getElementById('setRestoName').value.trim());
        formData.append('owner_name', document.getElementById('setOwnerName').value.trim());
        formData.append('phone', document.getElementById('setPhone').value.trim());
        formData.append('city', document.getElementById('setCity').value.trim());
        formData.append('country', document.getElementById('setCountry').value.trim());
        formData.append('address', document.getElementById('setAddress').value.trim());
        formData.append('opening_hours', document.getElementById('setOpeningHours').value.trim());
        formData.append('description', document.getElementById('setDescription').value.trim());
        formData.append('logo_url', document.getElementById('setLogoUrl').value.trim());

        const logoFile = document.getElementById('setLogoFile').files[0];
        if (logoFile) {
            formData.append('logo', logoFile);
        }

        try {
            const res = await fetch('/api/settings', {
                method: 'PUT',
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                alert('Paramètres du restaurant enregistrés avec succès !');
                currentResto = data.restaurant;
                setupRestoUI();
            } else {
                alert(data.error || 'Erreur lors de la sauvegarde.');
            }
        } catch (err) {
            alert('Impossible de contacter le serveur.');
        }
    });

    // Modals Plats
    const dishModal = document.getElementById('dishModal');
    const dishForm = document.getElementById('dishForm');

    document.getElementById('addDishBtn')?.addEventListener('click', () => {
        document.getElementById('dishModalTitle').textContent = 'Ajouter un plat';
        document.getElementById('dishEditId').value = '';
        dishForm.reset();
        document.getElementById('dishIsActive').checked = true;
        dishModal.classList.add('open');
    });

    document.getElementById('closeDishModalBtn')?.addEventListener('click', () => {
        dishModal.classList.remove('open');
    });

    window.editDish = function (dishId) {
        const dish = dishesList.find(d => d.id === dishId);
        if (!dish) return;

        document.getElementById('dishModalTitle').textContent = 'Modifier le plat';
        document.getElementById('dishEditId').value = dish.id;
        document.getElementById('dishName').value = dish.name;
        document.getElementById('dishPrice').value = dish.price;
        document.getElementById('dishCategorySelect').value = dish.category_id || '';
        document.getElementById('dishDescription').value = dish.description || '';
        document.getElementById('dishImageUrl').value = dish.image_url || '';
        document.getElementById('dishIsActive').checked = !!dish.is_active;

        dishModal.classList.add('open');
    };

    dishForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = document.getElementById('dishEditId').value;
        const formData = new FormData();
        formData.append('name', document.getElementById('dishName').value.trim());
        formData.append('price', document.getElementById('dishPrice').value);
        formData.append('category_id', document.getElementById('dishCategorySelect').value);
        formData.append('description', document.getElementById('dishDescription').value.trim());
        formData.append('image_url', document.getElementById('dishImageUrl').value.trim());
        formData.append('is_active', document.getElementById('dishIsActive').checked ? 1 : 0);

        const file = document.getElementById('dishImageFile').files[0];
        if (file) {
            formData.append('image', file);
        }

        const url = editId ? `/api/menu/dishes/${editId}` : '/api/menu/dishes';
        const method = editId ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, { method, body: formData });
            const data = await res.json();
            if (res.ok) {
                dishModal.classList.remove('open');
                await loadMenu();
            } else {
                alert(data.error || 'Erreur enregistrement plat.');
            }
        } catch (err) {
            alert('Impossible de contacter le serveur.');
        }
    });

    // Modals Catégories
    const catModal = document.getElementById('categoryModal');
    const catForm = document.getElementById('categoryForm');

    document.getElementById('addCategoryBtn')?.addEventListener('click', () => {
        document.getElementById('catModalTitle').textContent = 'Nouvelle catégorie';
        document.getElementById('catEditId').value = '';
        catForm.reset();
        document.getElementById('catOrder').value = (categoriesList.length + 1);
        catModal.classList.add('open');
    });

    document.getElementById('closeCatModalBtn')?.addEventListener('click', () => {
        catModal.classList.remove('open');
    });

    window.editCategory = function (id, name, order) {
        document.getElementById('catModalTitle').textContent = 'Modifier la catégorie';
        document.getElementById('catEditId').value = id;
        document.getElementById('catName').value = name;
        document.getElementById('catOrder').value = order;
        catModal.classList.add('open');
    };

    catForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = document.getElementById('catEditId').value;
        const name = document.getElementById('catName').value.trim();
        const display_order = document.getElementById('catOrder').value;

        const url = editId ? `/api/menu/categories/${editId}` : '/api/menu/categories';
        const method = editId ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, display_order })
            });
            if (res.ok) {
                catModal.classList.remove('open');
                await loadCategories();
                await loadMenu();
            } else {
                const data = await res.json();
                alert(data.error || 'Erreur enregistrement catégorie.');
            }
        } catch (err) {
            alert('Impossible de contacter le serveur.');
        }
    });

    // Filtres commandes
    document.querySelectorAll('[data-order-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-order-filter]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentOrderFilter = btn.getAttribute('data-order-filter');
            renderOrdersGrid();
        });
    });

    // Filtre menu
    document.getElementById('menuCatFilter')?.addEventListener('change', () => {
        renderDishesGrid();
    });

    // Navigation sidebar
    document.querySelectorAll('.dash-nav .nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.getAttribute('data-view');
            if (view) window.switchView(view);
        });
    });

    // Bouton copier lien public
    document.getElementById('copyPublicLinkBtn')?.addEventListener('click', () => {
        if (!currentResto) return;
        const fullUrl = `${window.location.origin}/${currentResto.slug}`;
        copyPublicUrl(fullUrl, document.getElementById('copyPublicLinkBtn'));
    });

    function copyPublicUrl(fullUrl, btn) {
        navigator.clipboard.writeText(fullUrl).then(() => {
            btn.innerHTML = '<span>✅</span> <span>Lien copié !</span>';
            setTimeout(() => {
                btn.innerHTML = btn.id === 'copyPublicLinkBtn' ? '<span>🔗</span> <span>Copier le lien public</span>' : 'Copier le lien';
            }, 2000);
        }).catch(() => window.prompt('Copiez ce lien :', fullUrl));
    }

    document.getElementById('copyPublicMenuLinkBtn')?.addEventListener('click', () => {
        if (currentResto) copyPublicUrl(`${window.location.origin}/${currentResto.slug}`, document.getElementById('copyPublicMenuLinkBtn'));
    });

    document.getElementById('sharePublicMenuBtn')?.addEventListener('click', async () => {
        if (!currentResto) return;
        const url = `${window.location.origin}/${currentResto.slug}`;
        const shareData = { title: currentResto.name, text: `Commandez chez ${currentResto.name}`, url };
        if (navigator.share) {
            try { await navigator.share(shareData); return; } catch (err) { if (err.name === 'AbortError') return; }
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(`${shareData.text} : ${url}`)}`, '_blank', 'noopener');
    });

    function showQrCode() {
        if (!currentResto) return;
        const url = `${window.location.origin}/${currentResto.slug}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&format=png&data=${encodeURIComponent(url)}`;
        const preview = document.getElementById('qrPreview');
        document.getElementById('qrCodeImage').src = qrUrl;
        const download = document.getElementById('downloadQrCodeBtn');
        download.href = qrUrl;
        download.download = `menu-${currentResto.slug}.png`;
        preview.hidden = false;
    }
    document.getElementById('showQrCodeBtn')?.addEventListener('click', showQrCode);
    document.getElementById('printQrCodeBtn')?.addEventListener('click', () => window.print());

    document.querySelectorAll('[data-period]').forEach(btn => {
        btn.addEventListener('click', async () => {
            analyticsPeriod = btn.dataset.period;
            document.querySelectorAll('[data-period]').forEach(item => item.classList.toggle('active', item === btn));
            await loadStats();
        });
    });

    document.getElementById('profileMenuBtn')?.addEventListener('click', () => {
        const dropdown = document.getElementById('profileDropdown');
        dropdown.hidden = !dropdown.hidden;
    });

    document.getElementById('notificationsBtn')?.addEventListener('click', () => {
        window.switchView('orders');
        const filter = document.querySelector('[data-order-filter="nouvelle"]');
        if (filter) filter.click();
    });

    // Toggle sidebar mobile
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    const dashSidebar = document.getElementById('dashSidebar');
    const dashSidebarOverlay = document.getElementById('dashSidebarOverlay');

    toggleSidebarBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dashSidebar?.classList.toggle('open');
        dashSidebarOverlay?.classList.toggle('active', !!isOpen);
    });

    dashSidebarOverlay?.addEventListener('click', () => {
        dashSidebar?.classList.remove('open');
        dashSidebarOverlay?.classList.remove('active');
    });

    async function handleLogout() {
        if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.href = '/login';
        }
    }

    document.getElementById('dropdownLogoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

    // ========================================
    // LOGIQUE DE TRADUCTION IA DU MENU
    // ========================================
    let currentSelectedTranslateDishId = null;
    let currentPreviewItems = [];

    window.openAiTranslateModal = function (scope = 'all', dishId = null) {
        const modal = document.getElementById('aiTranslateModal');
        if (!modal) return;

        currentSelectedTranslateDishId = dishId;
        const scopeSelect = document.getElementById('aiScope');
        const catScopeWrap = document.getElementById('aiCategoryScopeWrap');
        const dishScopeWrap = document.getElementById('aiDishScopeWrap');
        const catSelect = document.getElementById('aiCategorySelect');
        const countHint = document.getElementById('aiTranslateCountHint');

        // Réinitialiser les zones
        document.getElementById('aiTranslateResultsWrap').style.display = 'none';
        document.getElementById('aiTranslateLoading').style.display = 'none';
        document.getElementById('startAiTranslateBtn').disabled = false;

        // Remplir les catégories
        catSelect.innerHTML = categoriesList.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

        if (dishId) {
            scopeSelect.value = 'selected';
            const dish = dishesList.find(d => d.id === dishId);
            if (dish) {
                document.getElementById('aiDishSelectedName').textContent = `${dish.name} (${formatFCFA(dish.price)})`;
            }
            catScopeWrap.style.display = 'none';
            dishScopeWrap.style.display = 'block';
            countHint.textContent = '1 plat sélectionné';
        } else {
            scopeSelect.value = scope;
            dishScopeWrap.style.display = 'none';
            catScopeWrap.style.display = scope === 'category' ? 'block' : 'none';
            countHint.textContent = `${dishesList.filter(d => d.is_active).length} plat(s) actif(s) sur la carte`;
        }

        modal.classList.add('active');
    };

    window.openTranslateModalForDish = function (dishId) {
        window.openAiTranslateModal('selected', dishId);
    };

    function closeAiTranslateModal() {
        const modal = document.getElementById('aiTranslateModal');
        if (modal) modal.classList.remove('active');
    }

    document.getElementById('openAiTranslateMenuBtn')?.addEventListener('click', () => {
        window.openAiTranslateModal('all');
    });

    document.getElementById('closeAiTranslateModalBtn')?.addEventListener('click', closeAiTranslateModal);
    document.getElementById('cancelAiTranslateBtn')?.addEventListener('click', closeAiTranslateModal);

    // Changement du sélecteur de périmètre
    document.getElementById('aiScope')?.addEventListener('change', (e) => {
        const val = e.target.value;
        const catScopeWrap = document.getElementById('aiCategoryScopeWrap');
        const dishScopeWrap = document.getElementById('aiDishScopeWrap');
        const countHint = document.getElementById('aiTranslateCountHint');

        if (val === 'all') {
            catScopeWrap.style.display = 'none';
            dishScopeWrap.style.display = 'none';
            countHint.textContent = `${dishesList.filter(d => d.is_active).length} plat(s) au total`;
        } else if (val === 'category') {
            catScopeWrap.style.display = 'block';
            dishScopeWrap.style.display = 'none';
            countHint.textContent = 'Traduire tous les plats de la catégorie';
        } else if (val === 'selected') {
            catScopeWrap.style.display = 'none';
            dishScopeWrap.style.display = 'block';
            if (!currentSelectedTranslateDishId && dishesList.length > 0) {
                currentSelectedTranslateDishId = dishesList[0].id;
                document.getElementById('aiDishSelectedName').textContent = `${dishesList[0].name} (${formatFCFA(dishesList[0].price)})`;
            }
            countHint.textContent = '1 plat sélectionné';
        }
    });

    // Lancement de la traduction IA
    document.getElementById('startAiTranslateBtn')?.addEventListener('click', async () => {
        const targetLang = document.getElementById('aiTargetLang').value;
        const sourceLang = document.getElementById('aiSourceLang').value;
        const scope = document.getElementById('aiScope').value;
        const startBtn = document.getElementById('startAiTranslateBtn');
        const startBtnText = document.getElementById('startAiTranslateBtnText');
        const loader = document.getElementById('aiTranslateLoading');
        const resultsWrap = document.getElementById('aiTranslateResultsWrap');

        startBtn.disabled = true;
        startBtnText.textContent = 'Traduction en cours...';
        loader.style.display = 'flex';
        resultsWrap.style.display = 'none';

        const payload = {
            targetLang,
            sourceLang,
            scope
        };

        if (scope === 'selected' && currentSelectedTranslateDishId) {
            payload.dishIds = [currentSelectedTranslateDishId];
        } else if (scope === 'category') {
            payload.categoryId = document.getElementById('aiCategorySelect').value;
        }

        try {
            const res = await fetch('/api/translate/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            loader.style.display = 'none';
            startBtn.disabled = false;
            startBtnText.textContent = 'Générer la traduction IA';

            if (!res.ok || !data.success) {
                alert(data.error || 'Erreur lors de la traduction.');
                return;
            }

            currentPreviewItems = data.items || [];
            renderAiPreviewItems(currentPreviewItems, targetLang);
            resultsWrap.style.display = 'block';
            document.getElementById('aiResultsCount').textContent = `${currentPreviewItems.length} plat(s) traduit(s)`;

        } catch (err) {
            console.error('Erreur traduction:', err);
            loader.style.display = 'none';
            startBtn.disabled = false;
            startBtnText.textContent = 'Générer la traduction IA';
            alert('Impossible de contacter le service de traduction.');
        }
    });

    // Rendu des éléments dans la prévisualisation éditable
    function renderAiPreviewItems(items, targetLang) {
        const listContainer = document.getElementById('aiTranslateItemsList');
        if (!listContainer) return;

        const langLabels = {
            en: 'Anglais',
            pt: 'Portugais',
            es: 'Espagnol',
            fon: 'Fɔngbe (Fon)'
        };
        const langLabel = langLabels[targetLang] || targetLang.toUpperCase();

        listContainer.innerHTML = items.map(item => `
            <div class="ai-item-card" data-dish-id="${item.dishId}">
                <div class="ai-item-top">
                    <div>
                        <span class="ai-item-source-title">${item.originalName}</span>
                        <span style="color: var(--dash-text-muted); margin-left: 6px;">(${item.categoryName} • ${formatFCFA(item.price)})</span>
                    </div>
                    ${item.fromCache ? '<span class="ai-item-cache-tag">⚡ Cache instantané (0 coût)</span>' : '<span class="ai-item-cache-tag">✨ Google Gemini</span>'}
                </div>
                <div style="font-size: 0.8rem; color: var(--dash-text-muted); font-style: italic;">
                    "${item.originalDescription || 'Pas de description originale'}"
                </div>
                <div class="ai-item-fields">
                    <div class="ai-input-group">
                        <label class="ai-input-label">Nom du plat (${langLabel})</label>
                        <input type="text" class="ai-input-text ai-edit-name" value="${escapeHtml(item.translatedName)}">
                    </div>
                    <div class="ai-input-group">
                        <label class="ai-input-label">Description appétissante (${langLabel})</label>
                        <textarea class="ai-input-text ai-edit-desc" rows="2">${escapeHtml(item.translatedDescription)}</textarea>
                    </div>
                </div>
            </div>
        `).join('');
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // Sauvegarde des traductions validées / éditées
    document.getElementById('saveAiTranslationsBtn')?.addEventListener('click', async () => {
        const saveBtn = document.getElementById('saveAiTranslationsBtn');
        const targetLang = document.getElementById('aiTargetLang').value;
        const cards = document.querySelectorAll('.ai-item-card');

        const translations = [];
        cards.forEach(card => {
            const dishId = Number(card.getAttribute('data-dish-id'));
            const name = card.querySelector('.ai-edit-name').value.trim();
            const description = card.querySelector('.ai-edit-desc').value.trim();
            if (dishId && name) {
                translations.push({ dishId, name, description, status: 'valide' });
            }
        });

        if (translations.length === 0) {
            alert('Aucune traduction valide à enregistrer.');
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Enregistrement en cours...';

        try {
            const res = await fetch('/api/translate/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetLang,
                    translations
                })
            });

            const data = await res.json();
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<span>✓</span><span>Valider et Enregistrer sur mon menu</span>';

            if (!res.ok || !data.success) {
                alert(data.error || 'Erreur lors de la sauvegarde.');
                return;
            }

            // Notification succès
            closeAiTranslateModal();
            showOrderToast('✨ Menu Traduit avec succès !', `${translations.length} plat(s) enregistré(s) en ${targetLang.toUpperCase()}.`);
            await loadMenu();

        } catch (err) {
            console.error('Erreur sauvegarde traductions:', err);
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<span>✓</span><span>Valider et Enregistrer sur mon menu</span>';
            alert('Impossible de contacter le serveur.');
        }
    });

    // =========================================================================
    // NOUVELLES FONCTIONNALITÉS : IA & TRADUCTION & MINI-SITE BRANDING
    // =========================================================================

    const LANG_INFOS = {
        en: { name: 'Anglais', flag: '🇬🇧' },
        pt: { name: 'Portugais', flag: '🇵🇹' },
        es: { name: 'Espagnol', flag: '🇪🇸' },
        fon: { name: 'Fɔngbe (Fon)', flag: '🇧🇯' },
        de: { name: 'Allemand', flag: '🇩🇪' },
        it: { name: 'Italien', flag: '🇮🇹' },
        ar: { name: 'Arabe', flag: '🇸🇦' },
        zh: { name: 'Chinois', flag: '🇨🇳' }
    };

    let currentPreviewBatch = null;
    let activePreviewLang = 'en';
    let currentExistingLang = 'en';

    // 1. STUDIO IA & TRADUCTION CULINAIRE
    window.loadTranslationsStudio = async function () {
        try {
            // Remplir les catégories dans le sélecteur
            const catSelect = document.getElementById('transStudioCategorySelect');
            if (catSelect) {
                catSelect.innerHTML = categoriesList.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
            }

            // Lien direct vers le menu public
            const topMenuBtn = document.getElementById('viewPublicMenuFromTransTopBtn');
            if (topMenuBtn && restaurantData) {
                topMenuBtn.href = `/restaurant/${restaurantData.slug || 'le-jardin-des-saveurs'}`;
            }

            // Récupérer le statut de couverture
            const res = await fetch('/api/translate/status');
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    renderTranslationCoverage(data);
                }
            }

            // Charger les plats pour la langue existante active
            await loadExistingTranslations(currentExistingLang);

        } catch (err) {
            console.error('Erreur chargement studio de traduction:', err);
        }
    };

    function renderTranslationCoverage(data) {
        const total = data.totalDishes || dishesList.filter(d => d.is_active).length || 1;
        const totalEl = document.getElementById('transTotalDishesCount');
        if (totalEl) totalEl.textContent = `${total} plat(s) au menu`;

        const grid = document.getElementById('translationCoverageGrid');
        if (!grid) return;

        const coverage = data.coverage || {};
        grid.innerHTML = Object.keys(LANG_INFOS).map(lang => {
            const info = LANG_INFOS[lang];
            const count = coverage[lang] || 0;
            const pct = Math.min(100, Math.round((count / total) * 100));
            return `
                <div class="coverage-card-item">
                    <div class="coverage-card-top">
                        <span style="font-size: 0.84rem; font-weight: 700; color: #FFF; display: flex; align-items: center; gap: 0.35rem;">
                            <span>${info.flag}</span>
                            <span>${info.name}</span>
                        </span>
                        <span style="font-size: 0.75rem; font-weight: 800; color: ${pct === 100 ? '#10B981' : pct > 0 ? '#F59E0B' : 'var(--dash-text-muted)'}; font-family: var(--font-mono);">
                            ${count}/${total} (${pct}%)
                        </span>
                    </div>
                    <div class="coverage-bar-bg">
                        <div class="coverage-bar-fill" style="width: ${pct}%;"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function loadExistingTranslations(lang) {
        currentExistingLang = lang;
        const wrap = document.getElementById('existingLangTabsWrap');
        if (wrap) {
            wrap.innerHTML = Object.keys(LANG_INFOS).map(l => {
                const info = LANG_INFOS[l];
                const isActive = l === lang;
                return `
                    <button type="button" class="btn-action ${isActive ? 'btn-action-primary' : ''}" 
                            onclick="window.switchExistingTransLang('${l}')" style="padding: 0.35rem 0.75rem; font-size: 0.78rem;">
                        <span>${info.flag}</span> ${info.name}
                    </button>
                `;
            }).join('');
        }

        const tbody = document.getElementById('existingTransTableBody');
        const emptyMsg = document.getElementById('existingTransEmptyMsg');
        if (!tbody) return;

        try {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: var(--dash-text-muted);">Chargement des traductions...</td></tr>';
            const res = await fetch(`/api/translate/dishes/${lang}`);
            if (!res.ok) throw new Error('Erreur API');
            const data = await res.json();
            const list = data.translations || [];

            if (list.length === 0) {
                tbody.innerHTML = '';
                if (emptyMsg) emptyMsg.style.display = 'block';
                return;
            }

            if (emptyMsg) emptyMsg.style.display = 'none';
            tbody.innerHTML = list.map(item => `
                <tr id="row-trans-${item.dish_id}-${lang}">
                    <td>
                        <strong style="color: #FFF; display: block; font-size: 0.92rem;">${escapeHtml(item.original_name)}</strong>
                        <small style="color: var(--dash-text-muted); font-size: 0.78rem;">${escapeHtml(item.original_description || 'Sans description')}</small>
                        <div style="margin-top: 0.35rem;">
                            <span class="badge-status status-nouvelle" style="font-size: 0.68rem;">${escapeHtml(item.category_name || 'Général')}</span>
                            <span style="font-size: 0.75rem; font-family: var(--font-mono); color: #F87171; margin-left: 0.4rem;">${formatFCFA(item.price)}</span>
                        </div>
                    </td>
                    <td>
                        <input type="text" class="form-input" id="trans-name-${item.dish_id}-${lang}" value="${escapeHtml(item.name)}" style="font-size: 0.88rem; font-weight: 600; padding: 0.45rem 0.65rem;">
                    </td>
                    <td>
                        <textarea class="form-input" id="trans-desc-${item.dish_id}-${lang}" rows="2" style="font-size: 0.82rem; resize: vertical; padding: 0.45rem 0.65rem;">${escapeHtml(item.description || '')}</textarea>
                    </td>
                    <td style="text-align: right; white-space: nowrap;">
                        <button class="btn-action btn-action-success btn-3d" onclick="window.saveSingleDishTrans(${item.dish_id}, '${lang}')" title="Enregistrer les modifications">
                            Enregistrer
                        </button>
                        <button class="btn-action btn-action-danger" onclick="window.deleteDishTrans(${item.dish_id}, '${lang}')" title="Supprimer la traduction" style="margin-left: 0.3rem;">
                            ✕
                        </button>
                    </td>
                </tr>
            `).join('');

        } catch (err) {
            console.error('Erreur chargement traductions existantes:', err);
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #F87171;">Impossible de charger les traductions.</td></tr>';
        }
    }

    window.switchExistingTransLang = function(lang) {
        loadExistingTranslations(lang);
    };

    window.saveSingleDishTrans = async function(dishId, lang) {
        const nameInput = document.getElementById(`trans-name-${dishId}-${lang}`);
        const descInput = document.getElementById(`trans-desc-${dishId}-${lang}`);
        if (!nameInput) return;

        const name = nameInput.value.trim();
        const description = descInput ? descInput.value.trim() : '';
        if (!name) {
            alert('Le nom du plat traduit ne peut pas être vide.');
            return;
        }

        try {
            const res = await fetch('/api/translate/dish', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dishId, language: lang, name, description })
            });
            const data = await res.json();
            if (data.success) {
                showOrderToast('✓ Traduction mise à jour', `Le plat a été sauvegardé en ${LANG_INFOS[lang]?.name || lang}.`);
            } else {
                alert(data.error || 'Erreur lors de la mise à jour.');
            }
        } catch (e) {
            alert('Erreur réseau.');
        }
    };

    window.deleteDishTrans = async function(dishId, lang) {
        if (!confirm('Voulez-vous vraiment supprimer cette traduction ?')) return;
        try {
            const res = await fetch(`/api/translate/${dishId}/${lang}`, { method: 'DELETE' });
            if (res.ok) {
                showOrderToast('Traduction supprimée', 'Le plat reviendra à la version originale.');
                loadExistingTranslations(lang);
                const statusRes = await fetch('/api/translate/status');
                if (statusRes.ok) renderTranslationCoverage(await statusRes.json());
            }
        } catch (e) {
            alert('Erreur réseau.');
        }
    };

    document.getElementById('transStudioScope')?.addEventListener('change', (e) => {
        const wrap = document.getElementById('transStudioCategoryWrap');
        if (wrap) wrap.style.display = e.target.value === 'category' ? 'block' : 'none';
    });

    document.getElementById('btnLaunchAiBatchTranslate')?.addEventListener('click', async () => {
        const checkedLangs = Array.from(document.querySelectorAll('input[name="transTargetLang"]:checked')).map(el => el.value);
        if (checkedLangs.length === 0) {
            alert('Veuillez cocher au moins une langue de destination (ex: Anglais, Portugais, Espagnol).');
            return;
        }

        const sourceLang = document.getElementById('transStudioSourceLang')?.value || 'fr';
        const scope = document.getElementById('transStudioScope')?.value || 'all';
        const categoryId = document.getElementById('transStudioCategorySelect')?.value;

        const btn = document.getElementById('btnLaunchAiBatchTranslate');
        const loader = document.getElementById('transStudioLoadingState');
        const previewBlock = document.getElementById('transStudioPreviewBlock');

        btn.disabled = true;
        btn.innerHTML = '<span class="ai-pulse-spinner" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 6px;"></span> Traduction gastronomique en cours...';
        loader.style.display = 'block';
        previewBlock.style.display = 'none';

        try {
            const res = await fetch('/api/translate/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetLangs: checkedLangs,
                    sourceLang,
                    scope,
                    categoryId
                })
            });

            const data = await res.json();
            loader.style.display = 'none';
            btn.disabled = false;
            btn.innerHTML = '<span>✨</span> Lancer la Traduction IA Gastronomique';

            if (!res.ok || !data.success) {
                alert(data.error || 'Erreur lors de la génération de la traduction.');
                return;
            }

            currentPreviewBatch = data;
            renderBatchPreviewWorkspace(data);

        } catch (err) {
            console.error('Erreur appel traduction batch:', err);
            loader.style.display = 'none';
            btn.disabled = false;
            btn.innerHTML = '<span>✨</span> Lancer la Traduction IA Gastronomique';
            alert('Impossible de contacter le serveur.');
        }
    });

    function renderBatchPreviewWorkspace(data) {
        const previewBlock = document.getElementById('transStudioPreviewBlock');
        const countBadge = document.getElementById('transPreviewBatchCountBadge');
        const tabsWrap = document.getElementById('previewLangTabs');
        if (!previewBlock) return;

        previewBlock.style.display = 'block';
        previewBlock.scrollIntoView({ behavior: 'smooth' });

        const targetLangs = data.targetLangs || ['en'];
        activePreviewLang = targetLangs[0];

        const totalItems = Object.values(data.resultsByLang || {}).reduce((acc, arr) => acc + arr.length, 0);
        if (countBadge) countBadge.textContent = `${totalItems} plat(s) prêt(s)`;

        // Rendu des onglets
        tabsWrap.innerHTML = targetLangs.map(lang => {
            const info = LANG_INFOS[lang] || { name: lang, flag: '🌐' };
            const count = (data.resultsByLang && data.resultsByLang[lang]) ? data.resultsByLang[lang].length : 0;
            const isActive = lang === activePreviewLang;
            return `
                <button type="button" class="btn-action ${isActive ? 'btn-action-primary' : ''}" 
                        onclick="window.switchPreviewLang('${lang}')" style="padding: 0.45rem 0.9rem; font-size: 0.82rem;">
                    <span>${info.flag}</span> ${info.name} (${count})
                </button>
            `;
        }).join('');

        renderPreviewCardsForLang(activePreviewLang);
    }

    window.switchPreviewLang = function(lang) {
        activePreviewLang = lang;
        if (currentPreviewBatch) {
            renderBatchPreviewWorkspace(currentPreviewBatch);
        }
    };

    function renderPreviewCardsForLang(lang) {
        const container = document.getElementById('transPreviewCardsContainer');
        if (!container || !currentPreviewBatch || !currentPreviewBatch.resultsByLang) return;

        const items = currentPreviewBatch.resultsByLang[lang] || [];
        container.innerHTML = items.map((item, idx) => `
            <div class="preview-dish-card" data-dish-id="${item.dishId}" data-lang="${lang}">
                <div class="preview-orig-side">
                    <span style="font-size: 0.72rem; color: var(--dash-text-muted); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; display: block; margin-bottom: 0.35rem;">
                        Recette Originale (FR)
                    </span>
                    <strong style="color: #FFF; font-size: 1.05rem; display: block;">${escapeHtml(item.originalName)}</strong>
                    <p style="font-size: 0.84rem; color: var(--dash-text-muted); margin-top: 0.35rem; line-height: 1.5;">${escapeHtml(item.originalDescription || 'Sans description')}</p>
                    <div style="margin-top: 0.65rem; display: flex; align-items: center; gap: 0.6rem;">
                        <span class="badge-status status-nouvelle">${escapeHtml(item.categoryName || 'Général')}</span>
                        <span style="font-family: var(--font-mono); color: #F87171; font-weight: 700; font-size: 0.85rem;">${formatFCFA(item.price)}</span>
                    </div>
                </div>
                <div class="preview-edit-side">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <span style="font-size: 0.72rem; color: #10B981; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; display: flex; align-items: center; gap: 0.3rem;">
                            <span>✨</span> Traduction Gastronomique (${LANG_INFOS[lang]?.name || lang})
                        </span>
                        <span style="font-size: 0.7rem; color: var(--dash-text-muted);">Éditable en direct</span>
                    </div>
                    <input type="text" class="preview-edit-input preview-name-field" 
                           data-idx="${idx}" data-lang="${lang}" data-dish-id="${item.dishId}"
                           value="${escapeHtml(item.translatedName)}" placeholder="Nom traduit du plat">
                    <textarea class="preview-edit-input preview-desc-field" rows="2"
                              data-idx="${idx}" data-lang="${lang}" data-dish-id="${item.dishId}"
                              placeholder="Description gastronomique traduite">${escapeHtml(item.translatedDescription)}</textarea>
                </div>
            </div>
        `).join('');
    }

    document.getElementById('btnSaveTransPreviewAll')?.addEventListener('click', async () => {
        if (!currentPreviewBatch || !currentPreviewBatch.resultsByLang) return;

        // Synchroniser les valeurs saisies par l'utilisateur
        document.querySelectorAll('.preview-dish-card').forEach(card => {
            const dishId = Number(card.getAttribute('data-dish-id'));
            const lang = card.getAttribute('data-lang');
            const name = card.querySelector('.preview-name-field')?.value || '';
            const desc = card.querySelector('.preview-desc-field')?.value || '';

            if (currentPreviewBatch.resultsByLang[lang]) {
                const item = currentPreviewBatch.resultsByLang[lang].find(x => x.dishId === dishId);
                if (item) {
                    item.translatedName = name;
                    item.translatedDescription = desc;
                }
            }
        });

        // Aplatir tous les plats
        const allTranslations = [];
        Object.keys(currentPreviewBatch.resultsByLang).forEach(lang => {
            currentPreviewBatch.resultsByLang[lang].forEach(item => {
                allTranslations.push({
                    dishId: item.dishId,
                    targetLang: lang,
                    translatedName: item.translatedName,
                    translatedDescription: item.translatedDescription
                });
            });
        });

        // Aplatir les catégories traduites
        const allCategoryTranslations = [];
        if (currentPreviewBatch.categoriesByLang) {
            Object.keys(currentPreviewBatch.categoriesByLang).forEach(lang => {
                currentPreviewBatch.categoriesByLang[lang].forEach(cat => {
                    allCategoryTranslations.push({
                        categoryId: cat.categoryId,
                        targetLang: lang,
                        translatedName: cat.translatedName
                    });
                });
            });
        }

        const btn = document.getElementById('btnSaveTransPreviewAll');
        btn.disabled = true;
        btn.innerHTML = 'Enregistrement en cours...';

        try {
            const res = await fetch('/api/translate/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    translations: allTranslations,
                    categoryTranslations: allCategoryTranslations
                })
            });

            const data = await res.json();
            btn.disabled = false;
            btn.innerHTML = '<span>✓</span> Valider et Publier sur le Menu Public';

            if (!res.ok || !data.success) {
                alert(data.error || 'Erreur lors de la sauvegarde.');
                return;
            }

            document.getElementById('transStudioPreviewBlock').style.display = 'none';
            currentPreviewBatch = null;

            showOrderToast('✨ Carte Publiée avec Succès !', `${allTranslations.length} plat(s) enregistré(s) en plusieurs langues.`);

            // Rafraîchir les statistiques et la liste
            const statusRes = await fetch('/api/translate/status');
            if (statusRes.ok) renderTranslationCoverage(await statusRes.json());
            loadExistingTranslations(currentExistingLang);

        } catch (err) {
            console.error('Erreur sauvegarde traductions:', err);
            btn.disabled = false;
            btn.innerHTML = '<span>✓</span> Valider et Publier sur le Menu Public';
            alert('Impossible de contacter le serveur.');
        }
    });

    document.getElementById('btnDiscardTransPreview')?.addEventListener('click', () => {
        if (confirm('Voulez-vous abandonner cette prévisualisation ?')) {
            document.getElementById('transStudioPreviewBlock').style.display = 'none';
            currentPreviewBatch = null;
        }
    });

    // 2. STUDIO BRANDING & MINI-SITE
    window.loadMinisiteStudio = async function() {
        try {
            const res = await fetch('/api/settings/branding');
            if (!res.ok) return;
            const data = await res.json();
            if (!data.success || !data.branding) return;

            const b = data.branding;
            restaurantData = b;

            // URL en direct
            const liveUrl = b.public_url || `${window.location.origin}/${b.slug}`;
            const directUrl = b.direct_url || `${window.location.origin}/restaurant/${b.slug}`;

            const urlText = document.getElementById('minisiteLiveUrlText');
            if (urlText) urlText.textContent = liveUrl;

            const slugInput = document.getElementById('minisiteSlugInput');
            if (slugInput) slugInput.value = b.slug;

            const headerOpenBtn = document.getElementById('minisiteHeaderOpenBtn');
            if (headerOpenBtn) headerOpenBtn.href = directUrl;

            const directLinkBtn = document.getElementById('minisiteDirectLinkBtn');
            if (directLinkBtn) directLinkBtn.href = directUrl;

            const iframe = document.getElementById('minisitePreviewIframe');
            if (iframe) iframe.src = directUrl;

            // Formulaire d'identité visuelle
            const colorPicker = document.getElementById('minisiteColorPicker');
            const colorHex = document.getElementById('minisiteColorHexInput');
            const activeColor = b.brand_color || '#DC2626';
            if (colorPicker) colorPicker.value = activeColor;
            if (colorHex) colorHex.value = activeColor;

            // Marquer le preset actif
            document.querySelectorAll('#brandColorPresets .color-pill-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-color') === activeColor);
            });

            const taglineInput = document.getElementById('minisiteTaglineInput');
            if (taglineInput) taglineInput.value = b.tagline || '';

            const coverInput = document.getElementById('minisiteCoverUrlInput');
            if (coverInput) coverInput.value = b.cover_image_url || '';

            const whatsappInput = document.getElementById('minisiteWhatsappInput');
            if (whatsappInput) whatsappInput.value = b.whatsapp_number || b.phone || '';

            const instaInput = document.getElementById('minisiteInstagramInput');
            if (instaInput) instaInput.value = b.instagram_handle || '';

            // Domaine personnalisé
            const domainInput = document.getElementById('minisiteCustomDomainInput');
            if (domainInput) domainInput.value = b.custom_domain || '';

            const domainCard = document.getElementById('minisiteDomainStatusCard');
            const domainLabel = document.getElementById('minisiteDomainCurrentLabel');
            const domainBadge = document.getElementById('minisiteDomainBadge');

            if (b.custom_domain && domainCard) {
                domainCard.style.display = 'block';
                if (domainLabel) domainLabel.textContent = b.custom_domain;
                if (domainBadge) {
                    domainBadge.textContent = b.domain_status === 'actif' ? 'Domaine Actif' : 'En attente DNS';
                    domainBadge.className = b.domain_status === 'actif' ? 'badge-status status-prete' : 'badge-status status-prep';
                }
            } else if (domainCard) {
                domainCard.style.display = 'none';
            }

        } catch (err) {
            console.error('Erreur chargement mini-site studio:', err);
        }
    };

    // Device simulator switcher
    document.querySelectorAll('.btn-device-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-device-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const chassis = document.getElementById('minisiteDeviceChassis');
            if (!chassis) return;
            const device = btn.getAttribute('data-device');
            chassis.className = `minisite-device-chassis chassis-${device}`;
        });
    });

    // Couleurs & Presets
    document.querySelectorAll('#brandColorPresets .color-pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const color = btn.getAttribute('data-color');
            document.querySelectorAll('#brandColorPresets .color-pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const cp = document.getElementById('minisiteColorPicker');
            const ch = document.getElementById('minisiteColorHexInput');
            if (cp) cp.value = color;
            if (ch) ch.value = color;
        });
    });

    document.getElementById('minisiteColorPicker')?.addEventListener('input', (e) => {
        const hex = e.target.value;
        const ch = document.getElementById('minisiteColorHexInput');
        if (ch) ch.value = hex;
        document.querySelectorAll('#brandColorPresets .color-pill-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-color')?.toLowerCase() === hex.toLowerCase());
        });
    });

    document.getElementById('minisiteColorHexInput')?.addEventListener('input', (e) => {
        const hex = e.target.value;
        if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
            const cp = document.getElementById('minisiteColorPicker');
            if (cp) cp.value = hex;
            document.querySelectorAll('#brandColorPresets .color-pill-btn').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-color')?.toLowerCase() === hex.toLowerCase());
            });
        }
    });

    document.querySelectorAll('.btn-cover-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const cover = btn.getAttribute('data-cover');
            const inp = document.getElementById('minisiteCoverUrlInput');
            if (inp) inp.value = cover;
        });
    });

    // Sauvegarde de l'identité visuelle
    document.getElementById('minisiteBrandingForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const brand_color = document.getElementById('minisiteColorPicker')?.value || '#DC2626';
        const tagline = document.getElementById('minisiteTaglineInput')?.value || '';
        const cover_image_url = document.getElementById('minisiteCoverUrlInput')?.value || '';
        const whatsapp_number = document.getElementById('minisiteWhatsappInput')?.value || '';
        const instagram_handle = document.getElementById('minisiteInstagramInput')?.value || '';

        const saveBtn = document.getElementById('saveMinisiteBrandingBtn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = 'Enregistrement...';

        try {
            const res = await fetch('/api/settings/branding', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    brand_color,
                    tagline,
                    cover_image_url,
                    whatsapp_number,
                    instagram_handle
                })
            });

            const data = await res.json();
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<span>✓</span> Enregistrer l\'identité visuelle';

            if (!res.ok || !data.success) {
                alert(data.error || 'Erreur lors de la sauvegarde.');
                return;
            }

            showOrderToast('🎨 Identité visuelle mise à jour !', 'Les couleurs et visuels ont été appliqués sur votre mini-site.');
            // Actualiser l'iframe
            const iframe = document.getElementById('minisitePreviewIframe');
            if (iframe) iframe.src = iframe.src;

        } catch (err) {
            console.error('Erreur sauvegarde branding:', err);
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<span>✓</span> Enregistrer l\'identité visuelle';
            alert('Impossible de contacter le serveur.');
        }
    });

    // Copie de l'URL
    document.getElementById('minisiteCopyUrlBtn')?.addEventListener('click', () => {
        const url = document.getElementById('minisiteLiveUrlText')?.textContent?.trim() || `${window.location.origin}/${restaurantData?.slug || ''}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                const btn = document.getElementById('minisiteCopyUrlBtn');
                const orig = btn.innerHTML;
                btn.innerHTML = '<span>✓</span> URL Copiée !';
                showOrderToast('📋 URL copiée dans le presse-papier !', url);
                setTimeout(() => { btn.innerHTML = orig; }, 2500);
            }).catch(() => {
                alert(`Lien public : ${url}`);
            });
        } else {
            prompt('Copiez votre lien public :', url);
        }
    });

    // Modification du Slug
    document.getElementById('minisiteSaveSlugBtn')?.addEventListener('click', async () => {
        const slug = document.getElementById('minisiteSlugInput')?.value?.trim();
        if (!slug || slug.length < 3) {
            alert('Le slug doit contenir au moins 3 caractères.');
            return;
        }

        const btn = document.getElementById('minisiteSaveSlugBtn');
        btn.disabled = true;
        btn.textContent = 'Validation...';

        try {
            const res = await fetch('/api/settings/slug', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slug })
            });

            const data = await res.json();
            btn.disabled = false;
            btn.textContent = 'Valider';

            if (!res.ok || !data.success) {
                alert(data.error || 'Impossible de mettre à jour le slug.');
                return;
            }

            showOrderToast('🔗 Adresse mise à jour !', `Votre nouveau lien court est https://menudirect.bj/${data.slug}`);
            await window.loadMinisiteStudio();

        } catch (e) {
            btn.disabled = false;
            btn.textContent = 'Valider';
            alert('Erreur réseau.');
        }
    });

    // Partage WhatsApp
    document.getElementById('minisiteShareWhatsappBtn')?.addEventListener('click', () => {
        const url = document.getElementById('minisiteLiveUrlText')?.textContent?.trim() || window.location.href;
        const name = restaurantData?.name || 'notre restaurant';
        const msg = `Bonjour ! Découvrez la carte gourmande de ${name} et commandez directement en ligne ici : ${url}`;
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
    });

    // Partage Instagram
    document.getElementById('minisiteShareInstagramBtn')?.addEventListener('click', () => {
        const url = document.getElementById('minisiteLiveUrlText')?.textContent?.trim() || window.location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                alert(`Lien copié : ${url}\n\nOuvrez Instagram, allez sur votre profil > Modifier le profil > Liens > Ajouter un lien externe et collez-le !`);
            });
        } else {
            prompt('Collez ce lien dans votre bio Instagram :', url);
        }
    });

    // Télécharger le QR Code
    document.getElementById('minisiteDownloadQrBtn')?.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/settings/qrcode');
            if (res.ok) {
                const data = await res.json();
                if (data.qr_code) {
                    const a = document.createElement('a');
                    a.href = data.qr_code;
                    a.download = `menudirect-qrcode-${restaurantData?.slug || 'restaurant'}.png`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    showOrderToast('📲 QR Code téléchargé', 'Prêt pour impression sur table et cartes de visite.');
                }
            }
        } catch (e) {
            alert('Erreur téléchargement QR Code.');
        }
    });

    // Domaine personnalisé
    document.getElementById('minisiteSaveDomainBtn')?.addEventListener('click', async () => {
        const domain = document.getElementById('minisiteCustomDomainInput')?.value?.trim();
        if (!domain) {
            alert('Veuillez saisir votre nom de domaine (ex: menu.monrestaurant.com).');
            return;
        }

        try {
            const res = await fetch('/api/settings/domain', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ custom_domain: domain })
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                alert(data.error || 'Erreur enregistrement domaine.');
                return;
            }

            showOrderToast('🌐 Domaine enregistré', data.message);
            await window.loadMinisiteStudio();

        } catch (e) {
            alert('Erreur réseau.');
        }
    });

    document.getElementById('minisiteDisconnectDomainBtn')?.addEventListener('click', async () => {
        if (!confirm('Voulez-vous vraiment déconnecter ce domaine ?')) return;
        try {
            const res = await fetch('/api/settings/domain', { method: 'DELETE' });
            if (res.ok) {
                showOrderToast('Domaine déconnecté', 'Votre mini-site reste accessible via votre URL MenuDirect.');
                await window.loadMinisiteStudio();
            }
        } catch (e) {
            alert('Erreur réseau.');
        }
    });

    document.getElementById('minisiteRefreshPreviewBtn')?.addEventListener('click', () => {
        const iframe = document.getElementById('minisitePreviewIframe');
        if (iframe) iframe.src = iframe.src;
        showOrderToast('🔄 Aperçu actualisé', 'Le mini-site a été rechargé.');
    });

    // =========================================================================
    // GESTION DU THÈME SOMBRE ET CLAIR DU SAAS (DARK / LIGHT MODE)
    // =========================================================================
    function getStoredTheme() {
        try {
            return localStorage.getItem('md_theme') || 'dark';
        } catch (e) {
            return 'dark';
        }
    }

    function applyTheme(themeValue) {
        let effective = themeValue;
        if (themeValue === 'auto') {
            effective = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }

        document.documentElement.setAttribute('data-theme', effective);
        if (document.body) {
            document.body.setAttribute('data-theme', effective);
            if (effective === 'light') {
                document.documentElement.classList.add('theme-light');
                document.body.classList.add('theme-light');
            } else {
                document.documentElement.classList.remove('theme-light');
                document.body.classList.remove('theme-light');
            }
        }

        // Mettre à jour le bouton topbar
        const themeIcon = document.getElementById('themeIconIndicator');
        const themeLabel = document.getElementById('themeToggleLabel');
        if (themeIcon) {
            themeIcon.textContent = effective === 'dark' ? '🌙' : '☀️';
        }
        if (themeLabel) {
            themeLabel.textContent = effective === 'dark' ? 'Sombre' : 'Clair';
        }

        // Mettre à jour les radios et cartes dans les Paramètres
        document.querySelectorAll('input[name="saasThemeSetting"]').forEach(radio => {
            radio.checked = radio.value === themeValue;
        });

        document.querySelectorAll('.theme-preset-card').forEach(card => {
            const val = card.querySelector('input')?.value;
            card.classList.toggle('active', val === themeValue);
        });
    }

    function setTheme(newTheme) {
        try {
            localStorage.setItem('md_theme', newTheme);
        } catch (e) {}
        applyTheme(newTheme);
    }

    function initThemeManager() {
        const current = getStoredTheme();
        applyTheme(current);

        // Bouton Topbar 1-clic
        const toggleBtn = document.getElementById('themeToggleBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const now = getStoredTheme();
                let next;
                if (now === 'dark') next = 'light';
                else if (now === 'light') next = 'dark';
                else {
                    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                    next = isDark ? 'light' : 'dark';
                }
                setTheme(next);
                showOrderToast(
                    next === 'light' ? '☀️ Mode Clair activé' : '🌙 Mode Sombre activé',
                    'Votre confort d\'affichage a été appliqué.'
                );
            });
        }

        // Sélecteurs dans la vue Paramètres
        document.querySelectorAll('input[name="saasThemeSetting"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const choice = e.target.value;
                setTheme(choice);
                showOrderToast(
                    '🎨 Thème d\'affichage mis à jour',
                    choice === 'auto' ? 'Le thème s\'adaptera automatiquement à votre appareil.' : `Mode ${choice === 'light' ? 'Clair' : 'Sombre'} sélectionné.`
                );
            });
        });

        // Écouter les changements système OS si 'auto'
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
                if (getStoredTheme() === 'auto') {
                    applyTheme('auto');
                }
            });
        }
    }

    // Gestion des onglets de période pour le graphique d'évolution des commandes
    document.addEventListener('DOMContentLoaded', () => {
        initThemeManager();

        document.querySelectorAll('.chart-tab-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.chart-tab-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    });

    // Lancer le tableau de bord
    document.addEventListener('DOMContentLoaded', initDashboard);
})();

