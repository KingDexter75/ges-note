// State Management
    let state = {
        theme: localStorage.getItem('theme') || 'light',
        filters: {
            term: 'all',
            class: 'all',
            subject: 'all',
            dateFrom: '',
            dateTo: ''
        },
        seriesVisibility: {
            current: true,
            past: true
        }
    };

    // Initial setup
    document.addEventListener('DOMContentLoaded', () => {
        initTheme();
        initFilters();
        initExportButtons();
        initCharts();
        initSearch();
        initStatsCards();
        setupKeyboardShortcuts();
    });

    function initTheme() {
        // Application + bascule du theme : gerees de facon centralisee par
        // EduNeumTheme (js/core/routes.js) et le bouton du layout partage.
    }

    function initFilters() {
        const filterIds = ['filter-term', 'filter-class', 'filter-subject', 'date-from', 'date-to'];
        filterIds.forEach(id => {
            const el = document.getElementById(id);
            el.addEventListener('change', (e) => {
                const key = id.replace('filter-', '').replace('date-', 'date');
                state.filters[key] = e.target.value;
                updateDashboardData();
            });
        });

        document.getElementById('refresh-data').addEventListener('click', function() {
            const icon = document.getElementById('refresh-icon');
            icon.classList.add('loading-spinner');
            setTimeout(() => {
                updateDashboardData();
                icon.classList.remove('loading-spinner');
                showToast('Données synchronisées', 'success');
            }, 1000);
        });
    }

    function updateDashboardData() {
        console.log('Updating with state:', state.filters);
        // Simulate data fetch and DOM update
        const mainPath = document.getElementById('chart-path-main');
        const randomPaths = [
            "M0 180 Q 50 160 100 170 T 200 100 T 300 120 T 400 50",
            "M0 150 Q 50 140 100 160 T 200 80 T 300 100 T 400 30",
            "M0 190 Q 50 170 100 180 T 200 120 T 300 140 T 400 80"
        ];
        mainPath.setAttribute('d', randomPaths[Math.floor(Math.random() * randomPaths.length)]);
        
        const donut = document.getElementById('attendance-donut');
        const randomAttendance = Math.floor(Math.random() * (98 - 80 + 1) + 80);
        donut.setAttribute('stroke-dasharray', `${randomAttendance}, 100`);
        document.getElementById('attendance-val').textContent = `${randomAttendance}%`;
    }

/* ------------------------------------------------------------------
       Exports reels. La maquette simulait un telechargement : le bouton
       s'animait puis annoncait « PDF exporte avec succes (2.4 MB) » sans
       produire le moindre fichier. On genere maintenant un vrai PDF et un
       vrai classeur Excel a partir du store, en respectant les filtres
       affiches, et l'icone du bouton revient a la normale meme en cas
       d'erreur.
       ------------------------------------------------------------------ */
    function core() { return window.EduNeum || {}; }

    function anneeCourante() {
        const E = core();
        return E.layout && E.layout.anneeChoisie ? E.layout.anneeChoisie() : null;
    }

    /* Le selecteur propose « t1 », « t2 », « t3 » alors que les identifiants
       du store sont « an2025-t1 ». Sans ce rapprochement, l'export partirait
       sur un trimestre inexistant et sortirait vide. */
    function trimestresChoisis(annee) {
        const S = core().store;
        const tous = S.trimestresDe(annee.id);
        const choix = state.filters.term;
        if (!choix || choix === 'all') return tous;
        const n = Number(String(choix).replace(/^t/i, ''));
        const trouve = tous.filter(t => t.numero === n)[0];
        return trouve ? [trouve] : tous;
    }

    function classesChoisies(annee) {
        const S = core().store;
        let liste = S.classesDe(annee.id).filter(c => !c.archive);
        if (state.filters.class && state.filters.class !== 'all') {
            liste = liste.filter(c => c.id === state.filters.class);
        }
        return liste;
    }

    /* Une ligne par classe et par matiere : moyenne, extremes et taux de
       saisie reellement calcules sur les notes du store. */
    function construireLignes() {
        const E = core(), S = E.store, C = E.calculs;
        const annee = anneeCourante();
        if (!annee) return [];

        const matieres = (state.filters.subject && state.filters.subject !== 'all')
            ? [S.matiereParId(state.filters.subject)].filter(Boolean)
            : S.all('matieres').filter(m => !m.archive);
        const trimestres = trimestresChoisis(annee);
        const lignes = [];

        classesChoisies(annee).forEach(classe => {
            const eleves = S.elevesDeClasse(classe.id, annee.id);
            matieres.forEach(matiere => {
                const valeurs = [];
                eleves.forEach(eleve => {
                    trimestres.forEach(tr => {
                        const v = C.moyenneMatiereTrimestre({
                            eleveId: eleve.id, trimestreId: tr.id, matiereId: matiere.id
                        });
                        if (v !== null && v !== undefined) valeurs.push(v);
                    });
                });
                if (!valeurs.length) return;
                lignes.push({
                    classe: classe.nom,
                    matiere: matiere.nom,
                    effectif: eleves.length,
                    notes: valeurs.length,
                    moyenne: (valeurs.reduce((a, b) => a + b, 0) / valeurs.length),
                    minimum: Math.min.apply(null, valeurs),
                    maximum: Math.max.apply(null, valeurs)
                });
            });
        });
        return lignes;
    }

    const COLONNES_RAPPORT = [
        { cle: 'classe', titre: 'Classe' },
        { cle: 'matiere', titre: 'Matière' },
        { cle: 'effectif', titre: 'Effectif' },
        { cle: 'notes', titre: 'Notes saisies' },
        { cle: 'moyenne', titre: 'Moyenne' },
        { cle: 'minimum', titre: 'Minimum' },
        { cle: 'maximum', titre: 'Maximum' }
    ];

    function intituleFiltres(nbLignes) {
        const annee = anneeCourante();
        return (annee ? annee.libelle : 'Année') +
            ' · ' + (state.filters.term === 'all' ? 'toute l’année' : state.filters.term) +
            ' · ' + nbLignes + ' ligne(s)';
    }

    function preparing(btn, actif) {
        const span = btn.querySelector('span');
        const icon = btn.querySelector('iconify-icon');
        if (actif) {
            btn.dataset.avant = span.textContent;
            btn.dataset.avantIcon = icon ? icon.getAttribute('icon') : '';
            btn.disabled = true;
            span.textContent = 'Génération…';
            if (icon) { icon.setAttribute('icon', 'lucide:loader-2'); icon.classList.add('loading-spinner'); }
        } else {
            btn.disabled = false;
            if (btn.dataset.avant) span.textContent = btn.dataset.avant;
            if (icon && btn.dataset.avantIcon) icon.setAttribute('icon', btn.dataset.avantIcon);
            icon ? icon.classList.remove('loading-spinner') : null;
        }
    }

    function exporter(format) {
        const E = core();
        const btn = document.getElementById(format === 'pdf' ? 'btn-export-pdf' : 'btn-export-excel');
        const lignes = construireLignes();
        if (!lignes.length) {
            showToast('Aucune note sur ces filtres : rien à exporter.', 'info');
            return;
        }
        preparing(btn, true);
        try {
            const preparees = lignes.map(l => Object.assign({}, l, {
                moyenne: l.moyenne.toFixed(2).replace('.', ','),
                minimum: String(l.minimum).replace('.', ','),
                maximum: String(l.maximum).replace('.', ',')
            }));
            const nom = 'rapport-bilan';

            if (format === 'pdf') {
                E.ui.exporterPDF({
                    titre: 'Bilan par classe et par matière',
                    sousTitre: intituleFiltres(lignes.length),
                    meta: '',
                    entetes: COLONNES_RAPPORT.map(c => c.titre),
                    lignes: COLONNES_RAPPORT.map(c => preparees.map(l => l[c.cle])),
                    poids: [3, 3, 1.5, 2, 1.5, 1.5, 1.5],
                    alignements: ['gauche', 'gauche', 'droite', 'droite', 'droite', 'droite', 'droite'],
                    nom: nom
                });
            } else {
                E.ui.exporterXLSX(COLONNES_RAPPORT, preparees, nom, { titreFeuille: 'Bilan' });
            }
            if (E.page && E.page.tracer) E.page.tracer('export.bilan', 'format:' + format, 'Bilan par classe et par matière');
            showToast(format === 'pdf' ? 'PDF généré.' : 'Classeur Excel généré.', 'success');
        } catch (err) {
            showToast('Export impossible : ' + err.message, 'error');
        } finally {
            preparing(btn, false);
        }
    }

    /* Le bouton « Action » de la modale d'analyse n'avait aucun
       gestionnaire : il exporte desormais la vue qui vient d'être ouverte. */
    function exporterModale() {
        const E = core();
        const titre = document.getElementById('modal-title');
        const contenu = document.getElementById('modal-content');
        if (!titre || !contenu) return;
        const texte = (contenu.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
        if (!texte.length) { showToast('Cette vue est vide.', 'info'); return; }
        E.ui.exporterPDF({
            titre: titre.innerText || 'Analyse',
            sousTitre: '',
            meta: intituleFiltres(texte.length),
            entetes: ['Détail'],
            lignes: texte.map(l => [l]),
            poids: [10],
            alignements: ['gauche'],
            nom: 'rapport-analyse'
        });
        showToast('PDF de la vue généré.', 'success');
    }

    function initExportButtons() {
        document.getElementById('btn-export-pdf').addEventListener('click', () => exporter('pdf'));
        document.getElementById('btn-export-excel').addEventListener('click', () => exporter('xlsx'));

        document.getElementById('btn-print').addEventListener('click', () => {
            window.print();
        });

        document.getElementById('btn-share').addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.href);
            showToast('Lien copié dans le presse-papier', 'info');
        });

        document.getElementById('modal-action-btn').addEventListener('click', exporterModale);
    }

    function initCharts() {
        // Chart interactions implemented via SVG mouse events in HTML
    }

    function showTooltip(x, val, event) {
        const tooltip = document.getElementById('chart-tooltip');
        tooltip.textContent = `Moyenne: ${val}/20`;
        tooltip.classList.remove('hidden');
        tooltip.style.left = `${event.offsetX}px`;
        tooltip.style.top = `${event.offsetY - 30}px`;
    }

    function hideTooltip() {
        document.getElementById('chart-tooltip').classList.add('hidden');
    }

    function toggleSeries(type) {
        state.seriesVisibility[type] = !state.seriesVisibility[type];
        const path = document.getElementById(`chart-path-${type === 'current' ? 'main' : 'past'}`);
        const legend = document.getElementById(`legend-${type}`);
        
        if (state.seriesVisibility[type]) {
            path.style.opacity = '1';
            legend.classList.remove('opacity-30');
        } else {
            path.style.opacity = '0';
            legend.classList.add('opacity-30');
        }
    }

    function initSearch() {
        const input = document.getElementById('table-search');
        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            // Since sd-component is blackboxed, we simulate searching logs
            console.log('Searching for:', query);
            // In a real app, we would emit event to the DataTable component
        });
    }

    function initStatsCards() {
        const cards = ['card-avg', 'card-attendance', 'card-top', 'card-incidents'];
        cards.forEach(id => {
            document.getElementById(id).addEventListener('click', () => {
                openModal(id);
            });
        });
    }

    function openModal(type) {
        const modal = document.getElementById('drilldown-modal');
        const title = document.getElementById('modal-title');
        const content = document.getElementById('modal-content');
        
        modal.style.display = 'flex';
        
        const contentMap = {
            'card-avg': {
                title: 'Détails de la Moyenne',
                html: '<div class="grid grid-cols-2 gap-4"><div class="nm-inset p-4 rounded-2xl"><p class="text-xs text-gray-400">Meilleure Matière</p><p class="text-lg font-black">Maths (15.8)</p></div><div class="nm-inset p-4 rounded-2xl"><p class="text-xs text-gray-400">À renforcer</p><p class="text-lg font-black">LV2 (9.4)</p></div></div><div class="nm-flat p-4 rounded-2xl"><p class="text-sm mb-2 font-bold">Progression par classe</p><div class="space-y-2"><div class="flex justify-between text-xs"><span>Terminale S1</span><span>12.8</span></div><div class="w-full bg-gray-200 rounded-full h-1.5"><div class="bg-accent h-1.5 rounded-full" style="width: 64%"></div></div></div></div>'
            },
            'card-attendance': {
                title: 'Rapport d\'Assiduité',
                html: '<ul class="space-y-3"><li class="flex justify-between items-center p-3 nm-inset rounded-xl"><span>Absences non justifiées</span><span class="font-bold text-red-500">42h</span></li><li class="flex justify-between items-center p-3 nm-inset rounded-xl"><span>Retards fréquents</span><span class="font-bold">12 élèves</span></li></ul>'
            }
        };

        const data = contentMap[type] || { title: 'Rapport Détaillé', html: '<p class="text-gray-500">Chargement des données détaillées pour cette catégorie...</p>' };
        
        title.textContent = data.title;
        content.innerHTML = data.html;
    }

    function closeModal() {
        document.getElementById('drilldown-modal').style.display = 'none';
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        const icons = {
            success: 'lucide:check-circle',
            error: 'lucide:alert-circle',
            info: 'lucide:info'
        };
        const colors = {
            success: 'text-green-500',
            error: 'text-red-500',
            info: 'text-blue-500'
        };

        toast.className = 'nm-flat bg-white dark:bg-gray-800 p-4 rounded-2xl flex items-center space-x-3 toast-enter min-w-[280px]';
        toast.innerHTML = `
            <iconify-icon icon="${icons[type]}" class="${colors[type]} text-xl"></iconify-icon>
            <span class="text-sm font-bold">${message}</span>
        `;

        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'p') {
                e.preventDefault();
                window.print();
            }
            if (e.key === '/') {
                e.preventDefault();
                document.getElementById('table-search').focus();
            }
        });
    }

    function drillDownAttendance() {
        openModal('card-attendance');
    }

    /* Branchement des actions declaratives : les gestionnaires ne sont plus
       dans le HTML mais dans des attributs data-action, relies ici. */
    if (window.EduNeum && EduNeum.actions) EduNeum.actions.installer();