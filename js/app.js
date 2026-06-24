/* =============================================================
   Position Wizard — App Logic (Alpine.js)
   ============================================================= */

/* ---------- Theme ---------- */
function applyStoredTheme() {
  const saved = localStorage.getItem('pw-theme');
  if (saved === 'dark') document.documentElement.classList.add('dark');
  if (saved === 'light') document.documentElement.classList.add('light');
}
applyStoredTheme();

document.addEventListener('alpine:init', () => {
  Alpine.store('ui', {
    theme: localStorage.getItem('pw-theme') || 'auto',
    sidebarOpen: false,
    setTheme(mode) {
      this.theme = mode;
      document.documentElement.classList.remove('dark', 'light');
      if (mode !== 'auto') document.documentElement.classList.add(mode);
      localStorage.setItem('pw-theme', mode);
    },
    toggleSidebar() { this.sidebarOpen = !this.sidebarOpen; },
    closeSidebar() { this.sidebarOpen = false; },
  });

  Alpine.store('nav', {
    view: 'home',
    go(view) {
      this.view = view;
      Alpine.store('ui').closeSidebar();
      window.scrollTo({ top: 0 });
      pwPushState();
    },
  });

  /* ============================================================
     WIZARD
     ============================================================ */
  Alpine.data('wizard', () => ({
    step: 'start',
    history: [],
    answers: {},
    multiTemp: [],

    init() {
      const saved = sessionStorage.getItem('pw-wizard-state');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          this.step = parsed.step || 'start';
          this.history = parsed.history || [];
          this.answers = parsed.answers || {};
        } catch (e) { /* ignore corrupt state */ }
      }
    },

    persist() {
      sessionStorage.setItem('pw-wizard-state', JSON.stringify({
        step: this.step, history: this.history, answers: this.answers,
      }));
    },

    restart() {
      this.step = 'start';
      this.history = [];
      this.answers = {};
      this.multiTemp = [];
      sessionStorage.removeItem('pw-wizard-state');
      pwPushState();
    },

    back() {
      window.history.back();
    },

    select(key, value, nextStep, extra) {
      this.answers[key] = value;
      if (extra) Object.assign(this.answers, extra);
      this.history.push(this.step);
      this.step = nextStep;
      this.multiTemp = [];
      this.persist();
      pwPushState();
    },

    toggleMulti(value) {
      const i = this.multiTemp.indexOf(value);
      if (i === -1) this.multiTemp.push(value); else this.multiTemp.splice(i, 1);
    },

    confirmMulti(key, nextStep) {
      this.answers[key] = [...this.multiTemp];
      this.history.push(this.step);
      this.step = nextStep;
      this.multiTemp = [];
      this.persist();
      pwPushState();
    },

    // Fundamentals step has content-dependent routing (ticking anything
    // real means Create; ticking nothing / only "none" means Amend), so
    // it gets its own handler rather than the generic confirmMulti.
    submitFundamentals() {
      const sel = this.multiTemp.filter(v => v !== 'none');
      this.answers.fundamentalsDiff = sel;
      this.history.push(this.step);
      if (sel.length === 0) {
        this.answers.intent = 'change';
        this.step = 'occupied';
      } else {
        this.answers.intent = 'new';
        if (sel.includes('employee-status')) this.answers.employeeStatusChange = true;
        this.step = 'create-confirm';
      }
      this.multiTemp = [];
      this.persist();
      pwPushState();
    },

    onMultiContinue() {
      if (this.step === 'fundamentals') this.submitFundamentals();
      else if (this.step === 'sync-fields') this.confirmMulti('syncFields', 'recommendation');
    },

    get progressPct() {
      if (this.step === 'recommendation') return 100;
      return Math.min(90, 12 + this.history.length * 16);
    },

    get question() { return PW.getStepDef(this.step, this.answers); },
    get isRecommendation() { return this.step === 'recommendation'; },
    get recommendation() { return this.isRecommendation ? PW.buildRecommendation(this.answers) : null; },
    get matchedScenario() { return this.isRecommendation ? PW.matchScenario(this.answers) : null; },

    copied: false,
    copySummary() {
      const text = PW.recommendationToText(this.recommendation, this.matchedScenario);
      navigator.clipboard.writeText(text).then(() => {
        this.copied = true;
        setTimeout(() => { this.copied = false; }, 2200);
      });
    },
    printSummary() { window.print(); },
  }));

  /* ============================================================
     FIELD REFERENCE
     ------------------------------------------------------------
     1.4 — typo-tolerant search. Network access in this environment
     can't fetch an external library (Fuse.js / microfuzz), so this is
     a small hand-rolled equivalent: zero-dependency, self-hosted by
     definition, and tuned for this exact dataset (36 short field
     names). It does two things substring matching can't:
       1. Tokenises the query so multi-word searches ("pay scale")
          match across name + does + enter text with AND semantics.
       2. Falls back to Levenshtein distance against individual words
          in the field name/category, so single typos like
          "imunisation" or "paysacle" still surface the right field.
     ============================================================ */
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
    return dp[a.length][b.length];
  }

  function fuzzyTokenMatch(word, token) {
    if (!word || !token) return false;
    if (word.includes(token)) return true;
    const maxDist = token.length <= 4 ? 1 : token.length <= 8 ? 2 : 3;
    if (Math.abs(word.length - token.length) > maxDist + 2) return false;
    return levenshtein(word, token) <= maxDist;
  }

  // Does this one query token match anywhere in the field's searchable
  // text? Substring match across the long-form text (does/enter), plus
  // fuzzy word-level match against name/category (where typos actually
  // happen — nobody mistypes inside a sentence they're reading, just
  // inside the short term they're trying to recall).
  function fieldMatchesToken(f, token) {
    if (f.does.toLowerCase().includes(token) || f.enter.toLowerCase().includes(token)) return true;
    const words = (f.name + ' ' + f.category).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    // Typos often mash two words together ("paysacle" for "Pay Scale"),
    // so fuzzy-match against adjacent-word concatenations too, not just
    // single words.
    const bigrams = words.slice(0, -1).map((w, i) => w + words[i + 1]);
    return words.concat(bigrams).some(w => fuzzyTokenMatch(w, token));
  }

  Alpine.data('fieldRef', () => ({
    query: '',
    activeCategory: 'All',
    openId: null,
    categories: ['All', ...PW.CATEGORIES],

    get results() {
      const tokens = this.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
      return PW.FIELDS.filter(f => {
        const catOk = this.activeCategory === 'All' || f.category === this.activeCategory;
        if (!catOk) return false;
        if (!tokens.length) return true;
        return tokens.every(t => fieldMatchesToken(f, t));
      });
    },

    toggle(id) { this.openId = this.openId === id ? null : id; },
  }));

  /* ============================================================
     SYNC CHECKER
     ============================================================ */
  Alpine.data('syncChecker', () => ({
    occupied: null, // 'yes' | 'no' | 'future'
    selected: [],
    started: false,

    toggleField(id) {
      const i = this.selected.indexOf(id);
      if (i === -1) this.selected.push(id); else this.selected.splice(i, 1);
    },

    setOccupied(val) { this.occupied = val; this.started = true; this.selected = []; },

    reset() { this.occupied = null; this.selected = []; this.started = false; },

    get selectedDetails() {
      return this.selected
        .map(id => PW.SYNC_RELEVANT_FIELDS.find(f => f.id === id))
        .filter(Boolean);
    },
    get syncing() { return this.selectedDetails.filter(f => f.syncs); },
    get notSyncing() { return this.selectedDetails.filter(f => !f.syncs); },
    get hasPayScaleRisk() {
      return this.occupied === 'yes' && this.selectedDetails.some(f => f.payScaleWarning);
    },
    get recommendation() {
      if (this.occupied !== 'yes') {
        return {
          tone: 'info',
          text: this.occupied === 'no'
            ? 'This position is vacant \u2014 synchronisation is not relevant. Make your changes directly on the position; there are no incumbent records to push to.'
            : 'A future-dated vacancy has no current incumbent yet \u2014 synchronisation will not apply until someone actually occupies the position.',
          action: null,
        };
      }
      if (this.hasPayScaleRisk) {
        return {
          tone: 'danger',
          text: 'High risk: Pay Scale Type/Area/Group will synchronise, but Pay Scale Level will NOT. Incumbents could end up with a classification and pay point that no longer align, causing payroll processing errors. Verify every incumbent\u2019s current Pay Scale Level before synchronising.',
          // 1.5 — the safer alternative as a first-class recommended
          // action, not just a clause buried at the end of the prose.
          action: PW.SAFER_ALTERNATIVE,
        };
      }
      if (this.selected.length === 0) {
        return { tone: 'info', text: 'Select the fields you\u2019re changing above to see whether they will synchronise to incumbents.', action: null };
      }
      if (this.notSyncing.length > 0 && this.syncing.length === 0) {
        return {
          tone: 'warning',
          text: 'None of the fields you\u2019ve selected synchronise automatically. If every incumbent needs this update, the Position-level change alone will not reach them.',
          action: { label: 'Update each incumbent individually', detail: 'Use \u201cChange in Job or Compensation Information\u201d on each affected employee\u2019s record \u2014 there\u2019s no Position-level shortcut for these fields.' },
        };
      }
      return {
        tone: 'success',
        text: 'Safe to synchronise \u2014 as long as every current incumbent genuinely needs this exact change.',
        action: { label: 'Synchronise \u2014 if every incumbent genuinely needs it', detail: 'If even one incumbent doesn\u2019t need this change, use \u201cChange in Job or Compensation Information\u201d on their record instead of synchronising for everyone.' },
      };
    },
  }));

  /* ============================================================
     APPROVAL ESTIMATOR
     ============================================================ */
  Alpine.data('approvalEstimator', () => ({
    changeType: '',
    businessCase: '',

    get chainKey() {
      const map = {
        'new': 'create', 'fte-up': 'fte_increase', 'fte-down': 'fte_decrease',
        'title': 'title', 'reporting': 'other', 'cost-centre': 'other',
        'classification': 'classification', 'other': 'other',
      };
      return map[this.changeType] || null;
    },

    // Business case only changes the outcome for these two change types —
    // every other chain is identical with or without one, so there's no
    // reason to make a manager answer a question that won't change anything.
    get requiresBCQuestion() { return ['new', 'fte-up'].includes(this.changeType); },

    get chain() {
      if (!this.chainKey) return null;
      const entry = PW.APPROVAL_CHAINS[this.chainKey];
      if (this.requiresBCQuestion) {
        if (!this.businessCase) return null;
        return { stops: this.businessCase === 'yes' ? entry.withBC : entry.noBC, note: entry.note, headline: entry.headline || null, key: this.chainKey };
      }
      return { stops: entry.noBC, note: entry.note, headline: entry.headline || null, key: this.chainKey };
    },
  }));
});

/* ---------- Browser back/forward sync ----------
   Keeps window.history in step with the app so a hardware/gesture
   back press lands on the previous tool or wizard question instead
   of leaving the page. */
function pwSnapshotState() {
  const nav = Alpine.store('nav');
  const state = { view: nav.view };
  const w = window.__pwWizard;
  if (nav.view === 'wizard' && w) {
    state.wizardStep = w.step;
    state.wizardHistory = [...w.history];
    state.wizardAnswers = { ...w.answers };
  }
  return state;
}

function pwPushState() {
  history.pushState(pwSnapshotState(), '', '');
}

function pwApplyState(state) {
  const nav = Alpine.store('nav');
  nav.view = (state && state.view) || 'home';
  Alpine.store('ui').closeSidebar();
  const w = window.__pwWizard;
  if (nav.view === 'wizard' && w && state) {
    w.step = state.wizardStep || 'start';
    w.history = state.wizardHistory || [];
    w.answers = state.wizardAnswers || {};
    w.multiTemp = [];
    w.persist();
  }
}

window.addEventListener('popstate', (e) => pwApplyState(e.state));