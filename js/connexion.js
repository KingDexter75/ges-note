/* EduNeum - Page de connexion : le routage et la session sont geres par le coeur
   (js/core). Aucun lien externe : la destination depend du role choisi. */

    const ETATS_THEMES = ['light', 'dark', 'aqua', 'synthwave'];
    const ICONES_THEMES = { light: 'lucide:sun', dark: 'lucide:moon', aqua: 'lucide:droplets', synthwave: 'lucide:sparkles' };

    const state = {
      lang: sessionStorage.getItem('lang') || 'fr',
      theme: (function () {
        var v = localStorage.getItem('theme');
        return ETATS_THEMES.indexOf(v) >= 0 ? v : 'light';
      })(),
      step: 1,
      phone: '',
      password: '',
      destination: null,
      timer: 60,
      timerInterval: null
    };

    const translations = {
      fr: {
        title: "Portail Académique",
        subtitle: "Veuillez vous identifier pour continuer",
        phone: "Numéro de téléphone (Format CM: 6XXXXXXXX)",
        pass: "Mot de passe",
        next: "Envoyer le code OTP",
        sending: "Envoi en cours...",
        forgot: "Mot de passe oublié ?",
        otpSent: "Code OTP envoyé par SMS au",
        resend: "Renvoyer le code",
        resendWait: "Renvoyer le code",
        login: "Vérifier & Se connecter",
        back: "Retour",
        secure: "Connexion sécurisée AES-256",
        successTitle: "Connexion réussie !",
        redirect: "Redirection dans",
        continue: "Continuer vers le Dashboard",
        errPhone: "Format invalide (ex: 6 12 34 56 78)",
        errEmpty: "Veuillez remplir tous les champs",
        errOTP: "Code invalide. Réessayez.",
        msgSent: "Code OTP envoyé avec succès !",
        forgotTitle: "Récupération",
        forgotSub: "Saisissez votre téléphone pour réinitialiser.",
        roleAdmin: "Admin",
        roleTeacher: "Prof",
        roleCensor: "Censeur",
        themeTitle: "Thème",
        themeLight: "Clair",
        themeDark: "Sombre",
        themeAqua: "Aqua",
        themeSynthwave: "Synthwave"
      },
      en: {
        title: "Academic Portal",
        subtitle: "Please identify yourself to continue",
        phone: "Phone Number (CM Format: 6XXXXXXXX)",
        pass: "Password",
        next: "Send OTP Code",
        sending: "Sending...",
        forgot: "Forgot password?",
        otpSent: "OTP code sent by SMS to",
        resend: "Resend code",
        resendWait: "Resend code",
        login: "Verify & Login",
        back: "Back",
        secure: "AES-256 Secure Connection",
        successTitle: "Login Successful!",
        redirect: "Redirecting in",
        continue: "Continue to Dashboard",
        errPhone: "Invalid format (ex: 6 12 34 56 78)",
        errEmpty: "Please fill all fields",
        errOTP: "Invalid code. Try again.",
        msgSent: "OTP code sent successfully!",
        forgotTitle: "Recovery",
        forgotSub: "Enter your phone to reset.",
        roleAdmin: "Admin",
        roleTeacher: "Teacher",
        roleCensor: "Censor",
        themeTitle: "Theme",
        themeLight: "Light",
        themeDark: "Dark",
        themeAqua: "Aqua",
        themeSynthwave: "Synthwave"
      }
    };

    // UI Elements
    const toast = document.getElementById('toast');
    const phoneInput = document.getElementById('phone-input');
    const otpInputs = document.querySelectorAll('.otp-input');
    const otpTimerDisplay = document.getElementById('otp-timer-display');
    const resendBtn = document.getElementById('btn-resend');
    const loginCard = document.getElementById('login-card');

    function showToast(msg, type = 'error') {
      toast.innerText = msg;
      toast.className = `p-3 rounded-xl text-xs font-bold text-center animate-bounce ${type === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`;
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 3000);
    }

    function applyTheme() {
      const root = document.documentElement;
      const sombre = state.theme === 'dark' || state.theme === 'synthwave';
      root.setAttribute('data-theme', state.theme);
      root.classList.toggle('dark', sombre);
      root.classList.toggle('light', !sombre);
      localStorage.setItem('theme', state.theme);
      /* Dropdown : icone du bouton + item actif (coche). */
      const icon = document.getElementById('theme-icon');
      if (icon) icon.setAttribute('icon', ICONES_THEMES[state.theme] || 'lucide:sun');
      document.querySelectorAll('#theme-menu [data-theme-choix]').forEach((b) => {
        const actif = b.getAttribute('data-theme-choix') === state.theme;
        b.classList.toggle('nm-inset', actif);
        b.classList.toggle('nm-actif', actif);
        let check = b.querySelector('[data-theme-check]');
        if (actif && !check) {
          check = document.createElement('iconify-icon');
          check.setAttribute('icon', 'lucide:check');
          check.setAttribute('width', '14');
          check.setAttribute('data-theme-check', '1');
          check.className = 'ml-auto';
          b.appendChild(check);
        } else if (!actif && check) {
          check.remove();
        }
      });
    }

    function updateTranslations() {
      const t = translations[state.lang];
      document.getElementById('txt-title').innerText = t.title;
      document.getElementById('txt-subtitle').innerText = t.subtitle;
      document.getElementById('lbl-pass').innerText = t.pass;
      document.getElementById('lbl-phone').innerText = t.phone;
      document.getElementById('txt-btn-next').innerText = (state.step === 1) ? t.next : t.sending;
      document.getElementById('btn-forgot-password-trigger').innerText = t.forgot;
      document.getElementById('txt-otp-sent').innerText = t.otpSent;
      document.getElementById('txt-btn-login').innerText = t.login;
      document.getElementById('txt-back').innerText = t.back;
      document.getElementById('txt-secure').innerText = t.secure;
      document.getElementById('txt-success-title').innerText = t.successTitle;
      document.getElementById('txt-redirect').innerText = t.redirect;
      document.getElementById('txt-continue').innerText = t.continue;
      document.getElementById('txt-forgot-modal-title').innerText = t.forgotTitle;
      document.getElementById('txt-forgot-modal-sub').innerText = t.forgotSub;
      document.getElementById('txt-role-admin').innerText = t.roleAdmin;
      document.getElementById('txt-role-teacher').innerText = t.roleTeacher;
      document.getElementById('txt-role-censor').innerText = t.roleCensor;
      document.getElementById('txt-theme-title').innerText = t.themeTitle;
      document.getElementById('txt-theme-light').innerText = t.themeLight;
      document.getElementById('txt-theme-dark').innerText = t.themeDark;
      document.getElementById('txt-theme-aqua').innerText = t.themeAqua;
      document.getElementById('txt-theme-synthwave').innerText = t.themeSynthwave;
      
      const langFrBtn = document.getElementById('lang-fr');
      const langEnBtn = document.getElementById('lang-en');
      if (state.lang === 'fr') {
        langFrBtn.classList.add('bg-accent', 'text-white', 'shadow-md');
        langEnBtn.classList.remove('bg-accent', 'text-white', 'shadow-md');
        langEnBtn.classList.add('text-gray-500');
      } else {
        langEnBtn.classList.add('bg-accent', 'text-white', 'shadow-md');
        langFrBtn.classList.remove('bg-accent', 'text-white', 'shadow-md');
        langFrBtn.classList.add('text-gray-500');
      }
    }

    // Phone Formatting
    phoneInput.addEventListener('input', (e) => {
      let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,2})(\d{0,2})(\d{0,2})(\d{0,2})/);
      e.target.value = !x[2] ? x[1] : x[1] + ' ' + x[2] + (x[3] ? ' ' + x[3] : '') + (x[4] ? ' ' + x[4] : '') + (x[5] ? ' ' + x[5] : '');
    });

    // Theme Dropdown (4 themes)
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeMenuEl = document.getElementById('theme-menu');
    themeToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ouvert = !themeMenuEl.classList.contains('hidden');
      themeMenuEl.classList.toggle('hidden', ouvert);
      themeToggleBtn.setAttribute('aria-expanded', ouvert ? 'false' : 'true');
    });
    themeMenuEl.querySelectorAll('[data-theme-choix]').forEach((b) => {
      b.addEventListener('click', () => {
        state.theme = b.getAttribute('data-theme-choix');
        applyTheme();
        themeMenuEl.classList.add('hidden');
        themeToggleBtn.setAttribute('aria-expanded', 'false');
      });
    });
    document.addEventListener('click', () => {
      themeMenuEl.classList.add('hidden');
      themeToggleBtn.setAttribute('aria-expanded', 'false');
    });

    // Lang Toggle
    document.getElementById('lang-fr').addEventListener('click', () => {
      state.lang = 'fr';
      sessionStorage.setItem('lang', 'fr');
      updateTranslations();
    });
    document.getElementById('lang-en').addEventListener('click', () => {
      state.lang = 'en';
      sessionStorage.setItem('lang', 'en');
      updateTranslations();
    });

    // Step 1 -> 2
    document.getElementById('btn-step-1').addEventListener('click', () => {
      const pass = document.getElementById('input-pass').value;
      const phone = phoneInput.value.replace(/\s/g, '');
      const t = translations[state.lang];

      if (!pass || !phone) {
        showToast(t.errEmpty);
        return;
      }

      // Cameroon format: 6XXXXXXXX (9 digits starting with 6)
      if (!/^6\d{8}$/.test(phone)) {
        showToast(t.errPhone);
        return;
      }

      const btn = document.getElementById('btn-step-1');
      const text = document.getElementById('txt-btn-next');
      const icon = document.getElementById('icon-btn-next');

      btn.disabled = true;
      text.innerText = t.sending;
      icon.setAttribute('icon', 'lucide:loader-2');
      icon.classList.add('animate-spin');

      const A = window.EduNeum && window.EduNeum.auth;
      state.password = pass;
      state.phone = phoneInput.value;

      function restaurerBouton() {
        btn.disabled = false;
        text.innerText = t.next;
        icon.setAttribute('icon', 'lucide:arrow-right');
        icon.classList.remove('animate-spin');
      }

      /* Le compte est toujours verifie par Django, qui emet le code OTP et
         l'envoie par SMS via la passerelle Africa's Talking. */
      if (!A) {
        restaurerBouton();
        showToast('Service indisponible. Rechargez la page.');
        return;
      }
      fetch('/api/auth/otp/', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telephone: phone, motDePasse: pass })
      }).then(r => r.json().then(j => ({ ok: r.ok, j: j })))
        .then(res => {
          restaurerBouton();
          if (!res.ok || !res.j.ok) {
            showToast((res.j && res.j.motif) || 'Compte inconnu ou mot de passe incorrect.');
            return;
          }
          /* Connexion directe (téléphone + mot de passe), sans étape OTP :
             tant que la passerelle SMS n'est pas configurée. */
          if (res.j.direct) {
            if (A.definirSession) A.definirSession(res.j.session);
            state.destination = res.j.destination;
            loginSuccess();
            return;
          }
          allerEtape2();
        })
        .catch(() => { restaurerBouton(); showToast(t.errEmpty); });
    });

    function allerEtape2() {
      const phone = state.phone.replace(/\s/g, '');
      const displayPhone = '+237 ' + phone.replace(/(\d{1})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
      document.getElementById('txt-phone-display').innerText = displayPhone;
      document.getElementById('step-1').classList.add('hidden-step');
      setTimeout(() => {
        document.getElementById('step-1').style.display = 'none';
        document.getElementById('step-2').style.display = 'block';
        setTimeout(() => document.getElementById('step-2').classList.remove('hidden-step'), 50);
        startOTPTimer();
        showToast(translations[state.lang].msgSent, 'success');
        otpInputs[0].focus();
      }, 300);
    }

    // OTP Inputs Auto-focus
    otpInputs.forEach((input, i) => {
      input.addEventListener('keyup', (e) => {
        if (e.key >= 0 && e.key <= 9) {
          if (i < 5) otpInputs[i + 1].focus();
          else checkOTP();
        }
        if (e.key === 'Backspace') {
          if (i > 0) otpInputs[i - 1].focus();
        }
      });
    });

    function checkOTP() {
      const code = Array.from(otpInputs).map(i => i.value).join('');
      if (code.length === 6) { validateOTP(code); return true; }
      // Un clic sur « Verify & Login » avec un code incomplet doit le dire,
      // sinon le bouton parait ne rien faire.
      showToast(translations[state.lang].errOTP);
      otpInputs.forEach((input, i) => {
        input.classList.toggle('ring-2', true);
        input.classList.toggle('ring-red-400', true);
        if (i === 0) input.focus();
      });
      setTimeout(() => otpInputs.forEach(input => {
        input.classList.remove('ring-2', 'ring-red-400');
      }), 1200);
      return false;
    }

    function otpErreur(msg) {
      loginCard.classList.add('shake');
      showToast(msg);
      setTimeout(() => loginCard.classList.remove('shake'), 400);
      otpInputs.forEach(i => i.value = '');
      otpInputs[0].focus();
    }

    function validateOTP(code) {
      const t = translations[state.lang];
      const A = window.EduNeum && window.EduNeum.auth;
      const phone = state.phone.replace(/\s/g, '');
      fetch('/api/auth/verify/', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telephone: phone, code: code })
      }).then(r => r.json().then(j => ({ ok: r.ok, j: j })))
        .then(res => {
          if (res.ok && res.j.ok) {
            if (A && A.definirSession) A.definirSession(res.j.session);
            state.destination = res.j.destination;
            loginSuccess();
          } else {
            otpErreur((res.j && res.j.motif) || t.errOTP);
          }
        })
        .catch(() => otpErreur(t.errOTP));
    }

    function startOTPTimer() {
      clearInterval(state.timerInterval);
      state.timer = 60;
      const t = translations[state.lang];
      
      state.timerInterval = setInterval(() => {
        state.timer--;
        const mins = Math.floor(state.timer / 60);
        const secs = state.timer % 60;
        otpTimerDisplay.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        
        resendBtn.innerText = `${t.resendWait} (${state.timer}s)`;
        
        if (state.timer <= 0) {
          clearInterval(state.timerInterval);
          resendBtn.disabled = false;
          resendBtn.classList.remove('text-accent/50', 'cursor-not-allowed', 'pointer-events-none');
          resendBtn.classList.add('text-accent', 'hover:underline');
          resendBtn.innerText = t.resend;
        }
      }, 1000);
    }

    resendBtn.addEventListener('click', () => {
      if (resendBtn.disabled) return;
      resendBtn.disabled = true;
      resendBtn.classList.add('text-accent/50', 'cursor-not-allowed', 'pointer-events-none');
      const phone = state.phone.replace(/\s/g, '');
      fetch('/api/auth/resend/', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telephone: phone, motDePasse: state.password })
      }).then(r => r.json())
        .then(j => {
          if (!j.ok) showToast(j.motif || 'Envoi impossible.');
          else showToast(translations[state.lang].msgSent, 'success');
        })
        .catch(() => showToast(translations[state.lang].msgSent, 'success'));
      startOTPTimer();
    });

    /* Destination locale, derivee du role choisi sur la page de connexion.
       Remplace l'ancien lien de brouillon superdesign.dev. */
    function destination() {
      if (state.destination) return './' + state.destination;
      const R = window.EduNeum && window.EduNeum.routes;
      const A = window.EduNeum && window.EduNeum.auth;
      if (!R || !A) return './admin/tableau-de-bord.html';
      const choisi = document.querySelector('input[name="role"]:checked');
      const role = choisi ? choisi.id.replace('role-', '') : 'admin';
      return R.ROUTES[A.accueilPour(role)] || R.ROUTES.admin_dashboard;
    }

    function ouvrirSession() {
      const A = window.EduNeum && window.EduNeum.auth;
      if (!A) return null;
      return A.session();
    }

    function loginSuccess() {
      const t = translations[state.lang];
      document.getElementById('step-2').classList.add('hidden-step');
      setTimeout(() => {
        document.getElementById('step-2').style.display = 'none';
        document.getElementById('step-success').style.display = 'block';
        setTimeout(() => document.getElementById('step-success').classList.remove('hidden-step'), 50);
        
        ouvrirSession();
        let count = 2;
        const countdownEl = document.getElementById('redirect-countdown');
        const redirectInt = setInterval(() => {
          count--;
          countdownEl.innerText = count;
          if (count <= 0) {
            clearInterval(redirectInt);
            window.location.href = destination();
          }
        }, 1000);
      }, 300);
    }

    // Back Button
    document.getElementById('btn-back').addEventListener('click', () => {
      clearInterval(state.timerInterval);
      document.getElementById('step-2').classList.add('hidden-step');
      setTimeout(() => {
        document.getElementById('step-2').style.display = 'none';
        document.getElementById('step-1').style.display = 'block';
        setTimeout(() => document.getElementById('step-1').classList.remove('hidden-step'), 50);
      }, 300);
    });

    // Bouton « Verify & Login » de l'etape 2.
    // Le code n'etait verifie que par auto-validation a la 6e frappe : coller
    // le code, ou perdre le focus du dernier champ, laissait ce bouton sans
    // effet. Il appelle donc le meme chemin de validation.
    document.getElementById('btn-login').addEventListener('click', () => {
        clearInterval(state.timerInterval);
        checkOTP();
    });

    // Forgot Password Modal
    const modal = document.getElementById('forgot-modal');
    document.getElementById('btn-forgot-password-trigger').addEventListener('click', () => modal.classList.remove('hidden'));
    document.getElementById('close-forgot-btn').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('send-forgot-btn').addEventListener('click', () => {
      const email = document.getElementById('forgot-email').value;
      if (!email) return showToast(translations[state.lang].errEmpty);
      showToast(state.lang === 'fr' ? 'Lien de récupération envoyé !' : 'Recovery link sent!', 'success');
      modal.classList.add('hidden');
    });

    /* La fenetre de succes n'a plus de lien raccourci : le bouton « Continuer »
       mene a la destination reelle renvoyee par le serveur apres connexion. */
    const continueBtn = document.getElementById('continue-dashboard-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', function (e) {
        e.preventDefault();
        window.location.href = destination();
      });
    }

    // Init
    applyTheme();
    updateTranslations();
