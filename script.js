/* ================================================
   MenuDirect — Landing Page Scripts
   Animations, Interactions, Micro-UI
   ================================================ */

document.addEventListener('DOMContentLoaded', () => {

    // ========================================
    // 1. NAVBAR — Scroll Morph + Mobile Menu
    // ========================================
    const navbar = document.getElementById('navbar');
    const navToggle = document.getElementById('navToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileLinks = document.querySelectorAll('.mobile-link, .btn-mobile-cta');

    let lastScroll = 0;

    function handleNavbarScroll() {
        const scrollY = window.scrollY;
        if (scrollY > 80) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
        lastScroll = scrollY;
    }

    window.addEventListener('scroll', handleNavbarScroll, { passive: true });
    handleNavbarScroll();

    // Mobile menu toggle
    navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        mobileMenu.classList.toggle('active');
        document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
    });

    mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
            navToggle.classList.remove('active');
            mobileMenu.classList.remove('active');
            document.body.style.overflow = '';
        });
    });

    // ========================================
    // 2. HERO — Stagger Entrance Animations
    // ========================================
    const heroElements = [
        { el: document.querySelector('.hero-title-line-1'), delay: 200 },
        { el: document.querySelector('.hero-title-line-2'), delay: 400 },
        { el: document.getElementById('heroSubtitle'), delay: 650 },
        { el: document.getElementById('heroCta'), delay: 850 },
        { el: document.getElementById('heroStats'), delay: 1050 },
    ];

    heroElements.forEach(({ el, delay }) => {
        if (!el) return;
        setTimeout(() => {
            el.classList.add('revealed');
        }, delay);
    });

    // ========================================
    // 3. COUNTER ANIMATION — Stats
    // ========================================
    function animateCounter(el, target, duration = 2000) {
        const start = 0;
        const startTime = performance.now();

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(start + (target - start) * eased);

            // Format with spaces for thousands
            el.textContent = current.toLocaleString('fr-FR');

            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }

        requestAnimationFrame(update);
    }

    // Observe stats for counter animation
    const statsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counters = entry.target.querySelectorAll('.stat-number');
                counters.forEach(counter => {
                    const target = parseInt(counter.getAttribute('data-count'));
                    animateCounter(counter, target);
                });
                statsObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    const heroStats = document.getElementById('heroStats');
    if (heroStats) statsObserver.observe(heroStats);

    // ========================================
    // 4. SCROLL REVEAL — Cards & Sections
    // ========================================
    const revealElements = document.querySelectorAll('.step-card, .pricing-card, .testimonial-card');

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                // Stagger based on siblings
                const parent = entry.target.parentElement;
                const siblings = Array.from(parent.children);
                const siblingIndex = siblings.indexOf(entry.target);

                setTimeout(() => {
                    entry.target.classList.add('revealed');
                }, siblingIndex * 150);

                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });

    revealElements.forEach(el => revealObserver.observe(el));

    // ========================================
    // 5. TELEMETRY TYPEWRITER — Step 2
    // ========================================
    const telemetryMessages = [
        '▸ Commande #1247 reçue — Poulet braisé x2',
        '▸ Paiement MTN MoMo confirmé — 5 000 F',
        '▸ Commande #1248 reçue — Riz sauce arachide',
        '▸ Livraison en cours — #1245 → Fidjrossè',
        '▸ Commande #1249 — Alloco + poisson frit',
        '▸ Paiement Moov Money — 3 500 F ✓',
        '▸ Stock alerté : Poisson frais < 5 portions',
        '▸ Commande #1250 reçue — Spaghetti x3',
    ];

    const telemetryFeed = document.getElementById('telemetryFeed');
    let currentMessageIndex = 0;
    let currentCharIndex = 0;
    let telemetryInterval = null;
    let feedLines = [];

    function typeNextChar() {
        if (!telemetryFeed) return;

        const currentMessage = telemetryMessages[currentMessageIndex];

        if (currentCharIndex < currentMessage.length) {
            currentCharIndex++;
            renderFeed();
        } else {
            // Message complete, pause then move to next
            clearInterval(telemetryInterval);
            setTimeout(() => {
                currentCharIndex = 0;
                currentMessageIndex = (currentMessageIndex + 1) % telemetryMessages.length;
                feedLines.push(currentMessage);
                // Keep only last 1 line to prevent vertical overflow
                if (feedLines.length > 1) feedLines.shift();
                startTyping();
            }, 1400);
        }
    }

    function renderFeed() {
        const currentMessage = telemetryMessages[currentMessageIndex];
        const typedPart = currentMessage.substring(0, currentCharIndex);
        const previousLines = feedLines.map(line => `<div style="opacity:0.5">${line}</div>`).join('');
        telemetryFeed.innerHTML = previousLines + `<div>${typedPart}<span class="telemetry-cursor">▋</span></div>`;
    }

    function startTyping() {
        telemetryInterval = setInterval(typeNextChar, 40);
    }

    // Start telemetry when card is visible
    if (telemetryFeed) {
        const telemetryObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !telemetryInterval) {
                    startTyping();
                }
            });
        }, { threshold: 0.3 });

        const stepCard2 = document.getElementById('stepCard2');
        if (stepCard2) telemetryObserver.observe(stepCard2);
    }

    // ========================================
    // 6. CHART BARS (if present)
    // ========================================
    const chartBars = document.querySelectorAll('.chart-bar');
    if (chartBars.length > 0) {
        const chartObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const bars = entry.target.querySelectorAll('.chart-bar');
                    bars.forEach((bar, i) => {
                        bar.style.animationDelay = `${i * 0.1}s`;
                        bar.style.animationPlayState = 'running';
                    });
                    chartObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.3 });

        const stepCard3 = document.getElementById('stepCard3');
        if (stepCard3) chartObserver.observe(stepCard3);

        chartBars.forEach(bar => {
            bar.style.animationPlayState = 'paused';
        });
    }

    // ========================================
    // 7. SMOOTH ANCHOR SCROLLING
    // ========================================
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();
                const offset = 80;
                const targetPosition = targetElement.getBoundingClientRect().top + window.scrollY - offset;
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

    // ========================================
    // 8. SECTION HEADERS — Scroll Reveal
    // ========================================
    const sectionHeaders = document.querySelectorAll('.section-header');
    
    const headerObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                headerObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.2 });

    sectionHeaders.forEach(header => {
        header.style.opacity = '0';
        header.style.transform = 'translateY(30px)';
        header.style.transition = 'opacity 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        headerObserver.observe(header);
    });

    // ========================================
    // 9. CTA BAND — Parallax-like entrance
    // ========================================
    const ctaBand = document.querySelector('.cta-band-content');
    if (ctaBand) {
        const ctaObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    ctaBand.style.opacity = '1';
                    ctaBand.style.transform = 'translateY(0) scale(1)';
                    ctaObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.3 });

        ctaBand.style.opacity = '0';
        ctaBand.style.transform = 'translateY(30px) scale(0.97)';
        ctaBand.style.transition = 'opacity 0.9s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.9s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        ctaObserver.observe(ctaBand);
    }

    // ========================================
    // 10. MINI CARDS — Cycling Animation (Step 1)
    // ========================================
    const miniCards = document.querySelectorAll('.step-mini-card');
    let cycleIndex = 0;

    function cycleMiniCards() {
        if (miniCards.length === 0) return;
        
        miniCards.forEach((card, i) => {
            card.style.transition = 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
            card.style.transform = 'translateY(0) scale(1)';
            card.style.opacity = '1';
        });

        const activeCard = miniCards[cycleIndex];
        activeCard.style.transform = 'translateY(-4px) scale(1.02)';
        activeCard.style.borderColor = '#DC2626';
        activeCard.style.background = '#FEE2E2';

        // Reset previous
        miniCards.forEach((card, i) => {
            if (i !== cycleIndex) {
                card.style.borderColor = '';
                card.style.background = '';
                card.style.transform = '';
            }
        });

        cycleIndex = (cycleIndex + 1) % miniCards.length;
    }

    setInterval(cycleMiniCards, 2500);
    cycleMiniCards();

    // ========================================
    // 11. CONTACT MODAL
    // ========================================
    const contactModal = document.getElementById('contactModal');
    const modalClose = document.getElementById('modalClose');
    const contactForm = document.getElementById('contactForm');
    const modalSuccess = document.getElementById('modalSuccess');
    const modalSuccessClose = document.getElementById('modalSuccessClose');
    const navContactLink = document.getElementById('navContactLink');
    const mobileContactLink = document.getElementById('mobileContactLink');
    const enterpriseContactBtn = document.getElementById('enterpriseContactBtn');

    function openModal(e) {
        if (e) e.preventDefault();
        contactModal.classList.add('active');
        document.body.style.overflow = 'hidden';
        // Close mobile menu if open
        if (mobileMenu.classList.contains('active')) {
            navToggle.classList.remove('active');
            mobileMenu.classList.remove('active');
        }
        // Focus first input after animation
        setTimeout(() => {
            const firstInput = contactForm.querySelector('input');
            if (firstInput) firstInput.focus();
        }, 400);
    }

    function closeModal() {
        contactModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function resetModal() {
        contactForm.reset();
        contactForm.classList.remove('hidden');
        modalSuccess.classList.remove('visible');
    }

    // Open triggers
    if (navContactLink) navContactLink.addEventListener('click', openModal);
    if (mobileContactLink) mobileContactLink.addEventListener('click', openModal);
    if (enterpriseContactBtn) enterpriseContactBtn.addEventListener('click', openModal);
    const faqContactBtn = document.getElementById('faqContactBtn');
    if (faqContactBtn) faqContactBtn.addEventListener('click', openModal);

    // Close triggers
    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modalSuccessClose) modalSuccessClose.addEventListener('click', () => {
        closeModal();
        setTimeout(resetModal, 400);
    });

    // Close on overlay click
    contactModal.addEventListener('click', (e) => {
        if (e.target === contactModal) {
            closeModal();
            setTimeout(resetModal, 400);
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && contactModal.classList.contains('active')) {
            closeModal();
            setTimeout(resetModal, 400);
        }
    });

    // Form submission
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();

        // Collect form data
        const formData = new FormData(contactForm);
        const data = Object.fromEntries(formData.entries());
        console.log('Contact form submitted:', data);

        // Show success state
        contactForm.classList.add('hidden');
        modalSuccess.classList.add('visible');

        // Auto-close after 4 seconds
        setTimeout(() => {
            closeModal();
            setTimeout(resetModal, 400);
        }, 4000);
    });

    // ========================================
    // 12. HERO BACKGROUND WATERMARK VIDEO
    // ========================================
    const heroVideo = document.getElementById('heroVideo');
    if (heroVideo) {
        heroVideo.muted = true;
        heroVideo.defaultMuted = true;
        const tryPlayVideo = () => {
            const playPromise = heroVideo.play();
            if (playPromise !== undefined) {
                playPromise.catch(() => {
                    const resumeOnInteraction = () => {
                        heroVideo.play().catch(() => {});
                        window.removeEventListener('click', resumeOnInteraction);
                        window.removeEventListener('touchstart', resumeOnInteraction);
                        window.removeEventListener('scroll', resumeOnInteraction);
                    };
                    window.addEventListener('click', resumeOnInteraction, { once: true });
                    window.addEventListener('touchstart', resumeOnInteraction, { once: true });
                    window.addEventListener('scroll', resumeOnInteraction, { once: true });
                });
            }
        };
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            tryPlayVideo();
        } else {
            window.addEventListener('DOMContentLoaded', tryPlayVideo);
        }
    }

    // ========================================
    // 13. FAQ ACCORDION — One Question Open At A Time
    // ========================================
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach(item => {
        const btn = item.querySelector('.faq-question');
        if (!btn) return;

        btn.addEventListener('click', () => {
            const isCurrentlyOpen = item.classList.contains('active');

            // Close all other open FAQ items first
            faqItems.forEach(otherItem => {
                if (otherItem !== item && otherItem.classList.contains('active')) {
                    otherItem.classList.remove('active');
                    const otherBtn = otherItem.querySelector('.faq-question');
                    if (otherBtn) {
                        otherBtn.setAttribute('aria-expanded', 'false');
                    }
                }
            });

            // Toggle clicked item
            if (isCurrentlyOpen) {
                item.classList.remove('active');
                btn.setAttribute('aria-expanded', 'false');
            } else {
                item.classList.add('active');
                btn.setAttribute('aria-expanded', 'true');
            }
        });
    });

    // ========================================
    // 14. COPIER LE LIEN DU MENU (Section Liens & Accessibilité)
    // ========================================
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    const sampleLinkUrl = document.getElementById('sampleLinkUrl');
    const copiedToast = document.getElementById('copiedToast');

    if (copyLinkBtn && sampleLinkUrl) {
        copyLinkBtn.addEventListener('click', async () => {
            const urlText = sampleLinkUrl.textContent.trim();
            const fullUrl = 'https://' + urlText;

            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(fullUrl);
                } else {
                    const tempInput = document.createElement('input');
                    tempInput.value = fullUrl;
                    document.body.appendChild(tempInput);
                    tempInput.select();
                    document.execCommand('copy');
                    document.body.removeChild(tempInput);
                }

                const copyText = copyLinkBtn.querySelector('.copy-text');
                const copyIcon = copyLinkBtn.querySelector('.copy-icon');
                const checkIcon = copyLinkBtn.querySelector('.check-icon');

                copyLinkBtn.classList.add('copied');
                if (copyText) copyText.textContent = 'Lien copié !';
                if (copyIcon) copyIcon.style.display = 'none';
                if (checkIcon) checkIcon.style.display = 'inline-block';
                if (copiedToast) copiedToast.classList.add('show');

                setTimeout(() => {
                    copyLinkBtn.classList.remove('copied');
                    if (copyText) copyText.textContent = 'Copier le lien';
                    if (copyIcon) copyIcon.style.display = 'inline-block';
                    if (checkIcon) checkIcon.style.display = 'none';
                    if (copiedToast) copiedToast.classList.remove('show');
                }, 2400);
            } catch (err) {
                console.error('Erreur copie:', err);
            }
        });
    }

});
