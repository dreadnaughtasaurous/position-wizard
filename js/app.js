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
    },

    back() {
      if (!this.history.length) return;
      this.step = this.history.pop();
      this.multiTemp = [];
      this.persist();
    },

    select(key, value, nextStep, extra) {
      this.answers[key] = value;
      if (extra) Object.assign(this.answers, extra);
      this.history.push(this.step);
      this.step = nextStep;
      this.multiTemp = [];
      this.persist();
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
     ============================================================ */
  Alpine.data('fieldRef', () => ({
    query: '',
    activeCategory: 'All',
    openId: null,
    categories: ['All', ...PW.CATEGORIES],

    get results() {
      const q = this.query.trim().toLowerCase();
      return PW.FIELDS.filter(f => {
        const catOk = this.activeCategory === 'All' || f.category === this.activeCategory;
        if (!catOk) return false;
        if (!q) return true;
        return f.name.toLowerCase().includes(q) ||
          f.does.toLowerCase().includes(q) ||
          f.category.toLowerCase().includes(q);
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
        };
      }
      if (this.hasPayScaleRisk) {
        return {
          tone: 'danger',
          text: 'High risk: Pay Scale Type/Area/Group will synchronise, but Pay Scale Level will NOT. Incumbents could end up with a classification and pay point that no longer align, causing payroll processing errors. Verify every incumbent\u2019s current Pay Scale Level before synchronising \u2014 if this change really only applies to one person rather than the whole structural role, use Change in Job & Compensation Information on that individual\u2019s record instead.',
        };
      }
      if (this.selected.length === 0) {
        return { tone: 'info', text: 'Select the fields you\u2019re changing above to see whether they will synchronise to incumbents.' };
      }
      if (this.notSyncing.length > 0 && this.syncing.length === 0) {
        return {
          tone: 'warning',
          text: 'None of the fields you\u2019ve selected synchronise automatically. If every incumbent needs this update, you\u2019ll need to update each of their Job Information records individually \u2014 the Position-level change alone will not reach them.',
        };
      }
      return {
        tone: 'success',
        text: 'Safe to synchronise \u2014 as long as every current incumbent genuinely needs this change. If it actually applies to only one person rather than the whole position, use Change in Job & Compensation Information on their individual record instead of synchronising.',
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
        return { stops: this.businessCase === 'yes' ? entry.withBC : entry.noBC, note: entry.note, key: this.chainKey };
      }
      return { stops: entry.noBC, note: entry.note, key: this.chainKey };
    },
  }));
});
