    // Theme (application + bascule) : gere de facon centralisee par
    // EduNeumTheme (js/core/routes.js) et le bouton du layout partage.

    // Dashboard Update Logic
    function updateDashboard() {
      const selectedClass = document.getElementById('class-selector').value;
      const selectedTerm = document.getElementById('term-selector').value;
      const periodDisplay = document.getElementById('current-period-display');
      
      // Mock updating data display
      periodDisplay.innerText = selectedTerm.toUpperCase() + " - " + selectedClass.replace('-', ' ').toUpperCase();
      
      // Smooth animate charts
      const bars = document.querySelectorAll('.chart-bar');
      bars.forEach(bar => {
        const randHeight = Math.floor(Math.random() * 80) + 20;
        bar.style.height = randHeight + '%';
      });

      // Animate Pie Chart
      const path = document.getElementById('attendance-path');
      const percentageText = document.getElementById('attendance-percentage');
      const newVal = (Math.random() * 10 + 90).toFixed(1);
      path.setAttribute('stroke-dasharray', `${newVal}, 100`);
      percentageText.innerText = newVal + '%';
    }

    function refreshData() {
      const btn = document.getElementById('refresh-btn');
      const icon = document.getElementById('refresh-icon');
      icon.classList.add('loading-spinner');
      btn.disabled = true;

      setTimeout(() => {
        updateDashboard();
        icon.classList.remove('loading-spinner');
        btn.disabled = false;
        showNotification('Données synchronisées avec succès');
      }, 1500);
    }

    function resetFilters() {
      document.getElementById('class-selector').value = 'tle-s1';
      document.getElementById('term-selector').value = 't1';
      document.getElementById('subject-selector').value = 'all';
      updateDashboard();
    }

// Search Functionality
    function searchStudents() {
      const query = document.getElementById('student-search').value.toLowerCase();
      const rows = document.querySelectorAll('.student-row');
      rows.forEach(row => {
        const name = row.querySelector('.student-name').innerText.toLowerCase();
        row.dataset.visible = name.includes(query) ? '1' : '0';
      });
      /* Une recherche change le nombre de resultats : on revient en page 1,
         sinon on pourrait se retrouver sur une page devenue vide. */
      currentPage = 1;
      appliquerPagination();
    }

    /* ---------------------------- Pagination ----------------------------
       La maquette affichait trois boutons « 1 2 3 » sans aucun effet. La
       pagination porte maintenant sur les lignes reellement presentes :
       les lignes des autres pages sont retirees du flux, et un bouton dont
       la page n'existe pas est masque (au lieu d'rester inerte). Le tri et
       la recherche appellent appliquerPagination() pour rester coherents. */
    const PAR_PAGE = 3;
    let currentPage = 1;

    function lignesVisibles() {
      return Array.from(document.querySelectorAll('.student-row'))
        .filter(r => r.dataset.visible !== '0');
    }

    function goToPage(numero) {
      const total = lignesVisibles().length;
      const pages = Math.max(1, Math.ceil(total / PAR_PAGE));
      currentPage = Math.min(Math.max(1, Number(numero) || 1), pages);
      appliquerPagination();
    }

    function appliquerPagination() {
      const visibles = lignesVisibles();
      const pages = Math.max(1, Math.ceil(visibles.length / PAR_PAGE));
      if (currentPage > pages) currentPage = pages;
      const debut = (currentPage - 1) * PAR_PAGE;
      const fin = debut + PAR_PAGE;

      visibles.forEach((row, i) => {
        row.style.display = (i >= debut && i < fin) ? '' : 'none';
      });

      for (let p = 1; p <= 3; p++) {
        const btn = document.getElementById('page-btn-' + p);
        if (!btn) continue;
        const existe = p <= pages;
        btn.hidden = !existe;
        if (!existe) continue;
        const actif = p === currentPage;
        btn.className = 'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ' +
          (actif
            ? 'bg-accent text-white shadow-sm'
            : 'text-gray-400 hover:text-accent');
      }
    }

    /* Plein ecran du graphique : la maquette avait l'icone « agrandir » sans
       effet. On etend le conteneur du graphique sur toute la zone de contenu
       plutot que d'appeler requestFullscreen(), qui est refuse par le
       navigateur sans gesto utilisateur fiable sur un <div>. */
    function toggleChartFullscreen() {
      const conteneur = document.getElementById('grade-chart-container');
      const bouton = document.getElementById('btn-chart-fullscreen');
      if (!conteneur) return;
      const actif = conteneur.classList.toggle('chart-fullscreen');
      const icone = bouton ? bouton.querySelector('iconify-icon') : null;
      if (icone) icone.setAttribute('icon', actif ? 'lucide:minimize-2' : 'lucide:maximize-2');
      if (bouton) bouton.setAttribute('title', actif ? 'Rétablir la taille' : 'Agrandir le graphique');
      document.dispatchEvent(new Event('resize'));
    }

    // Sorting Functionality
    let sortDir = 1;
    function sortStudents(type) {
      const tableBody = document.getElementById('student-table-body');
      const rows = Array.from(tableBody.querySelectorAll('tr'));
      const btnAvg = document.getElementById('sort-avg-btn');
      const btnAbs = document.getElementById('sort-abs-btn');
      
      btnAvg.className = "p-2 text-[10px] font-black text-gray-400 hover:text-accent transition-all";
      btnAbs.className = "p-2 text-[10px] font-black text-gray-400 hover:text-accent transition-all";

      rows.sort((a, b) => {
        let valA, valB;
        if (type === 'avg') {
          valA = parseFloat(a.cells[1].innerText);
          valB = parseFloat(b.cells[1].innerText);
          btnAvg.className = "p-2 text-[10px] font-black text-accent nm-flat rounded-lg hover:nm-inset transition-all";
        } else {
          valA = parseInt(a.cells[4].innerText);
          valB = parseInt(b.cells[4].innerText);
          btnAbs.className = "p-2 text-[10px] font-black text-accent nm-flat rounded-lg hover:nm-inset transition-all";
        }
        return (valA - valB) * sortDir;
      });

sortDir *= -1;
      rows.forEach(row => tableBody.appendChild(row));
      /* Le tri a change l'ordre : on reapplique la page courante. */
      appliquerPagination();
    }

    // Modal Management
    function openDetailModal(title, value) {
      document.getElementById('modal-title').innerText = title;
      document.getElementById('modal-value').innerText = value;
      document.getElementById('detail-modal').classList.add('active');
    }

    function toggleEmailModal() {
      document.getElementById('email-modal').classList.add('active');
    }

    function closeModal(id) {
      document.getElementById(id).classList.remove('active');
    }

    // Export Simulations
    function exportData(format) {
      const btnId = format === 'pdf' ? 'btn-pdf-export' : 'btn-excel-export';
      const btn = document.getElementById(btnId);
      const originalText = btn.innerHTML;
      
      btn.innerHTML = '<iconify-icon icon="lucide:loader-2" class="loading-spinner"></iconify-icon><span>...</span>';
      btn.disabled = true;

      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
        showNotification(`Rapport ${format.toUpperCase()} généré et téléchargé`);
      }, 2000);
    }

    function sendEmail() {
      const btn = document.getElementById('send-email-btn');
      const originalContent = btn.innerHTML;
      
      btn.innerHTML = '<iconify-icon icon="lucide:loader-2" class="loading-spinner"></iconify-icon><span>ENVOI...</span>';
      btn.disabled = true;

      setTimeout(() => {
        closeModal('email-modal');
        btn.innerHTML = originalContent;
        btn.disabled = false;
        showNotification('E-mail envoyé avec succès');
      }, 2000);
    }

    // Utility Functions
    function showNotification(msg) {
      const notification = document.createElement('div');
      notification.className = "fixed bottom-6 right-6 px-6 py-4 nm-flat bg-accent text-white font-bold rounded-2xl shadow-2xl z-[100] transform translate-y-12 opacity-0 transition-all duration-300";
      notification.innerText = msg;
      document.body.appendChild(notification);

      setTimeout(() => {
        notification.classList.remove('translate-y-12', 'opacity-0');
      }, 100);

      setTimeout(() => {
        notification.classList.add('translate-y-12', 'opacity-0');
        setTimeout(() => notification.remove(), 300);
      }, 3000);
    }

    // Keyboard Navigation
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal('detail-modal');
        closeModal('email-modal');
      }
    });

// Init
    updateDashboard();
    /* Une seule page tant que le tableau ne contient pas plus de
       PAR_PAGE lignes : les boutons 2 et 3 sont donc retires. */
    appliquerPagination();

    /* Branchement des actions declaratives : les gestionnaires ne sont plus
       dans le HTML mais dans des attributs data-action, relies ici. */
    if (window.EduNeum && EduNeum.actions) EduNeum.actions.installer();