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
    previous: 'home',
    go(view) {
      this.previous = this.view;
      this.view = view;
      Alpine.store('ui').closeSidebar();
      Alpine.store('glossary').close();
      window.scrollTo({ top: 0 });
      pwPushState();
    },
  });

  /* ── Glossary tooltip popover \u2014 a single shared instance. Opened on
     hover/focus of any .glossary-term span injected by PW.glossarize(),
     with click/tap as the touch-device fallback (see the delegated
     listeners below \u2014 these spans are raw injected HTML, so Alpine
     directives never bind to them directly). ── */
  Alpine.store('glossary', {
    open: false,
    id: null,
    top: 0,
    left: 0,
    activeEl: null,
    get entry() {
      return (PW.GLOSSARY || []).find((g) => g.id === this.id) || null;
    },
    show(id, targetEl) {
      if (this.activeEl && this.activeEl !== targetEl) this.activeEl.setAttribute('aria-expanded', 'false');
      this.id = id;
      this.open = true;
      this.activeEl = targetEl || null;
      if (targetEl) targetEl.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => this.position(targetEl));
    },
    position(targetEl) {
      if (!targetEl) return;
      const r = targetEl.getBoundingClientRect();
      const popW = 280;
      let left = r.left + r.width / 2 - popW / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - popW - 12));
      let top = r.bottom + 8;
      // Flip above the term if there isn't room below.
      if (top + 140 > window.innerHeight) top = Math.max(8, r.top - 8 - 140);
      this.top = top;
      this.left = left;
    },
    close() {
      if (this.activeEl) this.activeEl.setAttribute('aria-expanded', 'false');
      this.open = false;
      this.id = null;
      this.activeEl = null;
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
    trail: [], // 3.3 — decision audit trail: [{ tag, title, answer }, ...]

    init() {
      const saved = sessionStorage.getItem('pw-wizard-state');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          this.step = parsed.step || 'start';
          this.history = parsed.history || [];
          this.answers = parsed.answers || {};
          this.trail = parsed.trail || [];
        } catch (e) { /* ignore corrupt state */ }
      }
    },

    persist() {
      sessionStorage.setItem('pw-wizard-state', JSON.stringify({
        step: this.step, history: this.history, answers: this.answers, trail: this.trail,
      }));
    },

    restart() {
      this.step = 'start';
      this.history = [];
      this.answers = {};
      this.trail = [];
      this.multiTemp = [];
      sessionStorage.removeItem('pw-wizard-state');
      pwPushState();
    },

    back() {
      window.history.back();
    },

    // 3.3 — records the question + chosen answer label onto the trail
    // before any state moves on, so it always reflects the question
    // that was actually on screen when the manager answered it.
    recordTrail(q, answerLabel) {
      if (!q) return;
      this.trail.push({ tag: q.tag, title: q.title, answer: answerLabel });
    },

    select(key, value, nextStep, extra) {
      const q = this.question;
      const opt = q ? (q.options || []).find(o => o.value === value) : null;
      this.recordTrail(q, opt ? opt.label : String(value));
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
      const q = this.question;
      const labels = this.multiTemp.map(v => {
        const opt = q ? (q.options || []).find(o => o.value === v) : null;
        return opt ? opt.label : v;
      });
      this.recordTrail(q, labels.length ? labels.join(', ') : 'None selected');
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
      const q = this.question;
      const sel = this.multiTemp.filter(v => v !== 'none');
      const labels = sel.map(v => {
        const opt = q ? (q.options || []).find(o => o.value === v) : null;
        return opt ? opt.label : v;
      });
      this.recordTrail(q, labels.length ? labels.join(', ') : 'None of these \u2014 everything fundamental matches an existing position');
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
      const text = PW.recommendationToText(this.recommendation, this.matchedScenario, this.trail);
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

    // 2.6 — lets other tools (the Lifecycle Map) jump straight to one
    // field, expanded and scrolled into view, regardless of whatever
    // search/category filter was previously active.
    openField(id) {
      this.activeCategory = 'All';
      this.query = '';
      this.openId = id;
      this.$nextTick(() => {
        const el = document.getElementById('field-' + id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    },
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

  /* ============================================================
     SUBMISSION READINESS CHECK — 2.1 Pre-flight Validator
     ------------------------------------------------------------
     A final, focused checklist for the five gotchas that trigger a
     Send Back (which resets the whole approval chain): Change Reason
     vs. intent, Multiple Holders vs. Target FTE, Business Case Number
     format, Pay Scale Year 1 / Level 1, and Parent Position
     verification. Works standalone (pick a Change Reason, answer the
     checks), but auto-picks up the most recent completed Decision
     Wizard session from sessionStorage so it never asks a manager to
     re-state what the wizard already worked out.
     ============================================================ */
  Alpine.data('preflight', () => ({
    mode: 'manual', // 'connected' | 'manual' | 'not-applicable'
    wizardAnswers: null,
    wizardRec: null,
    changeReasonId: null,

    targetFte: '',
    multipleHolders: null,        // 'yes' | 'no'
    manualFteDirection: null,     // 'increase' | 'decrease' — from wizard, or n/a in manual mode
    businessCaseHas: null,        // 'yes' | 'no'
    businessCaseNumber: '',
    payScaleConfirmed: null,      // 'yes' | 'no' | 'unsure'
    reportingLineChanging: null,  // 'yes' | 'no' — only asked for "Other Attributes"
    parentPositionVerified: null, // 'yes' | 'no'

    copied: false,

    init() {
      this.pullWizardContext();
      this.prefillFromWizard();
    },

    // Re-reads the wizard's session state and wipes any answers already
    // entered here. Deliberately NOT called on every visit (sidebar nav
    // alone never wipes a check in progress) — only exposed via
    // window.__pwPreflight so the wizard's recommendation screen can
    // force a fresh pull when a manager explicitly jumps here with a
    // brand-new recommendation in hand.
    refresh() {
      this.pullWizardContext();
      this.resetAnswers();
      this.prefillFromWizard();
    },

    pullWizardContext() {
      this.mode = 'manual';
      this.wizardAnswers = null;
      this.wizardRec = null;
      this.changeReasonId = null;
      const saved = sessionStorage.getItem('pw-wizard-state');
      if (!saved) return;
      try {
        const parsed = JSON.parse(saved);
        if (parsed.step !== 'recommendation' || !parsed.answers || !Object.keys(parsed.answers).length) return;
        const rec = PW.buildRecommendation(parsed.answers);
        this.wizardAnswers = parsed.answers;
        this.wizardRec = rec;
        if (rec.chainKey) {
          // Has a real Position-level Change Reason — there's something
          // to pre-flight check.
          this.mode = 'connected';
          this.changeReasonId = rec.changeReasonId;
        } else {
          // Transfer-into-existing-position or individual-variation —
          // never touches the Position record, so none of these five
          // gotchas apply.
          this.mode = 'not-applicable';
        }
      } catch (e) { /* ignore corrupt state */ }
    },

    prefillFromWizard() {
      if (this.mode !== 'connected' || !this.wizardAnswers) return;
      this.manualFteDirection = this.wizardAnswers.fteDirection || null;
      this.businessCaseHas = this.wizardAnswers.businessCase || null;
    },

    resetAnswers() {
      this.targetFte = '';
      this.multipleHolders = null;
      this.manualFteDirection = null;
      this.businessCaseHas = null;
      this.businessCaseNumber = '';
      this.payScaleConfirmed = null;
      this.reportingLineChanging = null;
      this.parentPositionVerified = null;
    },

    // "Not this one? Check something else instead" — drops the wizard
    // link entirely and starts a fully manual check.
    useManualInstead() {
      this.mode = 'manual';
      this.wizardRec = null;
      this.wizardAnswers = null;
      this.changeReasonId = null;
      this.resetAnswers();
    },

    // "Reset checks" — clears answers but keeps the chosen Change
    // Reason (and the wizard link, if connected) intact.
    resetInputs() {
      this.resetAnswers();
      this.prefillFromWizard();
    },

    selectChangeReason(id) {
      this.changeReasonId = id;
      this.resetAnswers();
      this.prefillFromWizard();
    },

    get reasonLabel() {
      const d = PW.CHANGE_REASONS.find(c => c.id === this.changeReasonId);
      return d ? d.label : '';
    },
    get recommendedChangeReasonId() { return this.mode === 'connected' ? this.wizardRec.changeReasonId : null; },
    get relevance() {
      if (!this.changeReasonId) return { fte: false, businessCase: false, payScale: false, parentPosition: false };
      return PW.preflightRelevance(this.changeReasonId, this.manualFteDirection);
    },

    // ---- The five gotchas ----
    get reasonCheck() {
      if (!this.changeReasonId) return { status: 'pending', text: 'Select the Change Reason you\u2019re about to use in SuccessFactors.' };
      if (this.recommendedChangeReasonId) {
        if (this.changeReasonId === this.recommendedChangeReasonId) {
          return { status: 'pass', text: 'Matches the Decision Wizard\u2019s recommendation for this submission.' };
        }
        const recLabel = PW.CHANGE_REASONS.find(c => c.id === this.recommendedChangeReasonId).label;
        return { status: 'fail', text: `This differs from your Decision Wizard recommendation \u2014 \u201c${recLabel}\u201d. A mismatched Change Reason locks you out of the fields you actually need.` };
      }
      return { status: 'info', text: 'No Decision Wizard recommendation on file to compare against \u2014 run the Decision Wizard first for a definitive cross-check.' };
    },

    get fteCheck() {
      if (!this.relevance.fte) return { status: 'na', text: `Target FTE and Multiple Holders aren\u2019t part of the \u201c${this.reasonLabel}\u201d field set.` };
      if (this.targetFte === '' || this.targetFte === null) return { status: 'pending', text: 'Enter the Target FTE you\u2019re about to submit to check this.' };
      const fte = parseFloat(this.targetFte);
      if (isNaN(fte)) return { status: 'pending', text: 'Enter a valid number for Target FTE.' };
      if (fte > 1.0) {
        if (this.multipleHolders === 'yes') return { status: 'pass', text: `Target FTE of ${fte} is above 1.0, and Multiple Holders Allowed is set to Yes \u2014 correct.` };
        if (this.multipleHolders === 'no') return { status: 'fail', text: `Target FTE of ${fte} is above 1.0, so Multiple Holders Allowed must be Yes \u2014 otherwise the position can\u2019t actually carry the incumbents it\u2019s funded for.` };
        return { status: 'pending', text: 'Confirm what Multiple Holders Allowed is set to.' };
      }
      return { status: 'pass', text: `Target FTE of ${fte} is 1.0 or below \u2014 Multiple Holders Allowed isn\u2019t required by this rule (genuine job-share arrangements aside).` };
    },

    get bcCheck() {
      if (!this.relevance.businessCase) return { status: 'na', text: `A business case doesn\u2019t change the approval chain for \u201c${this.reasonLabel}\u201d.` };
      if (this.businessCaseHas === null) return { status: 'pending', text: 'Confirm whether you have a Finance-approved business case attached.' };
      if (this.businessCaseHas === 'no') return { status: 'info', text: 'No business case attached \u2014 that\u2019s fine, but one would shorten your approval chain for this change.' };
      const v = (this.businessCaseNumber || '').trim();
      if (!v) return { status: 'pending', text: 'Enter the Business Case Number Finance gave you.' };
      if (PW.isValidBusinessCaseNumber(v)) return { status: 'pass', text: `\u201c${v}\u201d matches the required XX.XXX format.` };
      return { status: 'fail', text: `\u201c${v}\u201d doesn\u2019t match the required format \u2014 two-digit year, three-digit sequence (e.g. 25.042).` };
    },

    get payScaleCheck() {
      if (!this.relevance.payScale) return { status: 'na', text: `Pay Scale fields aren\u2019t part of the \u201c${this.reasonLabel}\u201d field set.` };
      if (this.payScaleConfirmed === 'yes') return { status: 'pass', text: 'Pay Scale Group and Pay Scale Level are both set to Year 1 / Level 1 \u2014 correct, regardless of who you expect to recruit.' };
      if (this.payScaleConfirmed === 'no') return { status: 'fail', text: 'Change Pay Scale Group and Pay Scale Level back to the Year 1 / Level 1 base options \u2014 this preserves maximum recruitment flexibility.' };
      if (this.payScaleConfirmed === 'unsure') return { status: 'warn', text: 'Check the Field Reference Guide entry for Pay Scale Group before you submit \u2014 this is one of the most common mistakes in the system.' };
      return { status: 'pending', text: 'Confirm you\u2019ve selected the Year 1 / Level 1 base group and level.' };
    },

    get parentPositionCheck() {
      const rel = this.relevance.parentPosition;
      if (!rel) return { status: 'na', text: `Parent Position isn\u2019t part of the \u201c${this.reasonLabel}\u201d field set.` };
      if (rel === 'conditional') {
        if (this.reportingLineChanging === null) return { status: 'pending', text: 'Confirm whether the reporting line (Parent Position) is part of this change.' };
        if (this.reportingLineChanging === 'no') return { status: 'na', text: 'Not part of this change \u2014 nothing to verify here.' };
      }
      if (this.parentPositionVerified === 'yes') return { status: 'pass', text: 'Parent Position has been verified, not just trusted from auto-population.' };
      if (this.parentPositionVerified === 'no') return { status: 'fail', text: 'Verify Parent Position before submitting \u2014 a wrong reporting line is one of the most common org-chart errors, and a Send Back resets your whole approval chain.' };
      return { status: 'pending', text: 'Confirm you\u2019ve verified the Parent Position rather than trusting the auto-populated value.' };
    },

    get checks() {
      return [
        { key: 'reason', title: 'Change Reason matches intent', status: this.reasonCheck.status, text: this.reasonCheck.text },
        { key: 'fte', title: 'Multiple Holders vs Target FTE', status: this.fteCheck.status, text: this.fteCheck.text },
        { key: 'bc', title: 'Business Case Number format', status: this.bcCheck.status, text: this.bcCheck.text },
        { key: 'payscale', title: 'Pay Scale at Year 1 / Level 1', status: this.payScaleCheck.status, text: this.payScaleCheck.text },
        { key: 'parent', title: 'Parent Position verified', status: this.parentPositionCheck.status, text: this.parentPositionCheck.text },
      ];
    },

    get summary() {
      if (!this.changeReasonId) return { tone: 'info', text: 'Select the Change Reason you\u2019re about to use above to start the check.' };
      const relevant = this.checks.filter(c => c.status !== 'na');
      const failing = relevant.filter(c => c.status === 'fail');
      const pending = relevant.filter(c => c.status === 'pending');
      if (failing.length) return { tone: 'danger', text: `${failing.length} issue${failing.length === 1 ? '' : 's'} found \u2014 fix ${failing.length === 1 ? 'it' : 'them'} before you submit, or a Send Back resets this approval chain.` };
      if (pending.length) return { tone: 'warning', text: `${pending.length} check${pending.length === 1 ? '' : 's'} still need${pending.length === 1 ? 's' : ''} an answer before this is a complete check.` };
      return { tone: 'success', text: 'No gotchas detected in this checklist \u2014 looks ready for SuccessFactors. This isn\u2019t exhaustive, so use your judgement on anything unusual.' };
    },

    badgeClass(status) {
      return { pass: 'badge-success', fail: 'badge-danger', warn: 'badge-warning', info: 'badge-info', na: 'badge-neutral', pending: 'badge-brand' }[status] || 'badge-neutral';
    },
    badgeLabel(status) {
      return { pass: 'Pass', fail: 'Needs fixing', warn: 'Check again', info: 'Note', na: 'N/A', pending: 'Incomplete' }[status] || status;
    },

    copySummary() {
      const lines = [];
      lines.push('SUBMISSION READINESS CHECK');
      lines.push('Generated by the Position Wizard (unofficial reference tool) \u2014 ' + new Date().toLocaleDateString('en-AU'));
      lines.push('');
      lines.push('Change Reason: ' + (this.reasonLabel || 'Not selected'));
      lines.push('Overall: ' + this.summary.text);
      lines.push('');
      this.checks.forEach(c => {
        const tag = { pass: 'PASS', fail: 'NEEDS FIXING', warn: 'CHECK AGAIN', na: 'N/A', pending: 'INCOMPLETE', info: 'NOTE' }[c.status] || c.status.toUpperCase();
        lines.push(`[${tag}] ${c.title}`);
        lines.push('  ' + c.text);
      });
      lines.push('');
      lines.push('This is an unofficial reference tool \u2014 confirm anything unusual with HR Services before submitting: ' + PW.HELP_URL);
      navigator.clipboard.writeText(lines.join('\n')).then(() => {
        this.copied = true;
        setTimeout(() => { this.copied = false; }, 2200);
      });
    },
  }));

  /* ============================================================
     CHANGE PREVIEW — "Approver's-Eye View" — 1.
     ------------------------------------------------------------
     Renders an amendment exactly as an approver sees it on
     SuccessFactors' Workflow Details page (Guide 5): each changed
     field as old value (struck through) next to new value, the
     change-reason-specific approval chain beneath, and a generated
     first-draft justification comment. Mirrors preflight()'s
     connect/manual pattern \u2014 auto-picks up the last completed
     Decision Wizard session when its outcome was an amendment, but
     never assumes the actual old/new values, since the wizard only
     ever captures which *kind* of change it is, not the values
     themselves.
     ============================================================ */
  Alpine.data('changePreview', () => ({
    mode: 'manual', // 'connected' | 'manual' | 'not-applicable'
    wizardRec: null,

    changeReasonId: null,
    positionRef: '',
    occupied: null,        // 'yes' | 'no' | 'future'
    fteDirection: null,    // 'increase' | 'decrease'
    businessCase: null,    // 'yes' | 'no'
    businessCaseNumber: '',
    incumbentCount: '',
    selectedFieldIds: [],
    values: {},            // { [fieldId]: { old: '', new: '' } }
    comment: '',
    commentEdited: false,
    copied: false,

    init() { this.pullWizardContext(); },

    // Exposed via window.__pwChangePreview so the wizard's amend
    // recommendation can force a fresh pull, the same way it already
    // does for Submission Readiness and the Deactivation Checklist.
    refresh() { this.resetAll(); this.pullWizardContext(); },

    pullWizardContext() {
      this.mode = 'manual';
      this.wizardRec = null;
      const saved = sessionStorage.getItem('pw-wizard-state');
      if (!saved) return;
      try {
        const parsed = JSON.parse(saved);
        if (parsed.step !== 'recommendation' || !parsed.answers || !Object.keys(parsed.answers).length) return;
        const path = PW.derivePath(parsed.answers);
        if (path !== 'amend') {
          // Create / Transfer / Individual variation / Deactivate have
          // no "old value" to diff against \u2014 nothing for this tool to do.
          this.mode = 'not-applicable';
          this.wizardRec = PW.buildRecommendation(parsed.answers);
          return;
        }
        this.mode = 'connected';
        const a = parsed.answers;
        this.wizardRec = PW.buildRecommendation(a);
        this.changeReasonId = a.whatChanging || 'other';
        this.occupied = a.occupied || null;
        this.fteDirection = a.fteDirection || null;
        this.businessCase = a.businessCase || null;
        if (a.syncFields && a.syncFields.length) {
          const candidateIds = this.candidateFieldsFor(this.changeReasonId).map(f => f.id);
          const carried = a.syncFields.filter(id => candidateIds.includes(id));
          this.selectedFieldIds = carried.length ? carried : this.defaultSelectedIdsFor(this.changeReasonId);
        } else {
          this.selectedFieldIds = this.defaultSelectedIdsFor(this.changeReasonId);
        }
      } catch (e) { /* ignore corrupt state */ }
    },

    // "Not this one? Build manually instead" \u2014 drops the wizard link.
    useManualInstead() {
      this.mode = 'manual';
      this.wizardRec = null;
      this.resetAll();
    },

    resetAll() {
      this.changeReasonId = null;
      this.positionRef = '';
      this.occupied = null;
      this.fteDirection = null;
      this.businessCase = null;
      this.businessCaseNumber = '';
      this.incumbentCount = '';
      this.selectedFieldIds = [];
      this.values = {};
      this.comment = '';
      this.commentEdited = false;
    },

    selectChangeReason(id) {
      this.changeReasonId = id;
      this.selectedFieldIds = this.defaultSelectedIdsFor(id);
      this.values = {};
      this.commentEdited = false;
    },

    // Position Title and Target FTE have their own dedicated Change
    // Reasons, so they're fixed single-field cases here rather than
    // picker lists \u2014 Classification and Other Attributes reuse the
    // shared field lists from data.js so sync/payroll-risk flags can
    // never drift from the canonical per-field data.
    candidateFieldsFor(id) {
      if (id === 'fte') return [{ id: 'target-fte', name: 'Target FTE', syncs: false, payScaleWarning: false }];
      if (id === 'title') return [{ id: 'position-title', name: 'Position Title', syncs: true, payScaleWarning: false }];
      if (id === 'classification') return PW.CLASSIFICATION_FIELDS;
      if (id === 'other') return PW.OTHER_ATTRIBUTE_FIELDS;
      return [];
    },
    defaultSelectedIdsFor(id) {
      if (id === 'fte') return ['target-fte'];
      if (id === 'title') return ['position-title'];
      if (id === 'classification') return ['pay-scale-group', 'pay-scale-level'];
      return [];
    },

    get candidateFields() { return this.candidateFieldsFor(this.changeReasonId); },
    get isFixedField() { return this.changeReasonId === 'fte' || this.changeReasonId === 'title'; },
    get recommendedChangeReasonId() { return (this.mode === 'connected' && this.wizardRec) ? this.wizardRec.changeReasonId : null; },
    get reasonLabel() {
      const d = PW.CHANGE_REASONS.find(c => c.id === this.changeReasonId);
      return d ? d.label : '';
    },

    toggleField(id) {
      if (this.isFixedField) return;
      const i = this.selectedFieldIds.indexOf(id);
      if (i === -1) this.selectedFieldIds.push(id);
      else { this.selectedFieldIds.splice(i, 1); delete this.values[id]; }
    },

    // Plain text for everything except Target FTE \u2014 SuccessFactors
    // values like cost centres and parent positions are free text in
    // practice, so a single numeric special-case covers the one field
    // where a number keypad genuinely helps.
    inputType(id) { return id === 'target-fte' ? 'number' : 'text'; },

    getValue(id, which) { return (this.values[id] && this.values[id][which]) || ''; },
    setValue(id, which, val) {
      if (!this.values[id]) this.values[id] = { old: '', new: '' };
      this.values[id][which] = val;
    },

    get rows() {
      return this.selectedFieldIds
        .map(id => this.candidateFields.find(f => f.id === id))
        .filter(Boolean)
        .map(f => ({
          id: f.id, name: f.name, syncs: f.syncs, payScaleWarning: f.payScaleWarning,
          old: this.getValue(f.id, 'old'), new: this.getValue(f.id, 'new'),
        }));
    },

    get bcRelevant() { return this.changeReasonId === 'fte' && this.fteDirection === 'increase'; },
    get hasPayScaleRisk() { return this.occupied === 'yes' && this.rows.some(r => r.payScaleWarning); },
    get chain() { return this.changeReasonId ? PW.getApprovalChain(this.changeReasonId, this.fteDirection, this.businessCase) : null; },

    get generatedComment() {
      return PW.buildJustificationComment(this.changeReasonId, this.rows, {
        positionRef: this.positionRef, fteDirection: this.fteDirection,
        businessCase: this.businessCase, businessCaseNumber: this.businessCaseNumber,
        occupied: this.occupied, incumbentCount: this.incumbentCount,
      });
    },
    onCommentInput(v) { this.comment = v; this.commentEdited = true; },
    regenerateComment() { this.commentEdited = false; },

    copySummary() {
      const lines = [];
      lines.push('CHANGE PREVIEW \u2014 APPROVER\u2019S-EYE VIEW');
      lines.push('Generated by the Position Wizard (unofficial reference tool) \u2014 ' + new Date().toLocaleDateString('en-AU'));
      lines.push('');
      if (this.positionRef) lines.push('Position: ' + this.positionRef);
      lines.push('Change Reason: ' + this.reasonLabel);
      lines.push('');
      lines.push('CHANGE SUMMARY:');
      this.rows.forEach(r => {
        const syncTag = this.occupied === 'yes' ? (r.payScaleWarning ? '  [HIGH RISK \u2014 does not sync]' : r.syncs ? '  [syncs to incumbents]' : '  [does not sync \u2014 update individually]') : '';
        lines.push(`  ${r.name}: ${r.old || '\u2014'} \u2192 ${r.new || '\u2014'}${syncTag}`);
      });
      if (this.businessCase === 'yes') {
        lines.push('');
        lines.push('Business case attached' + (this.businessCaseNumber ? ': ' + this.businessCaseNumber : ' \u2014 number not entered yet'));
      }
      if (this.chain) {
        lines.push('');
        lines.push(`APPROVAL CHAIN (${this.chain.stops.length} ${this.chain.stops.length === 1 ? 'step' : 'steps'}):`);
        this.chain.stops.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
        if (this.chain.headline) lines.push('  ' + this.chain.headline);
        lines.push('  ' + this.chain.note);
      }
      lines.push('');
      lines.push('DRAFT COMMENT FOR SUBMISSION:');
      lines.push('  ' + (this.commentEdited ? this.comment : this.generatedComment));
      lines.push('');
      lines.push('This is an unofficial reference tool \u2014 confirm anything unusual with HR Services before submitting: ' + PW.HELP_URL);
      navigator.clipboard.writeText(lines.join('\n')).then(() => {
        this.copied = true;
        setTimeout(() => { this.copied = false; }, 2200);
      });
    },
    printSummary() { window.print(); },
  }));

  /* ============================================================
     DEACTIVATION CHECKLIST — 2.7
     ------------------------------------------------------------
     Guide 7's three prerequisites for "Making Positions Inactive",
     each checked individually rather than as the wizard's single
     combined gate question — useful on its own for a manager who
     already knows they want to deactivate and lands here directly,
     and as a final double-check before actually submitting. Mirrors
     the preflight() component's connect/manual pattern, just for
     three checks instead of five.
     ============================================================ */
  Alpine.data('deactivationChecklist', () => ({
    mode: 'manual', // 'connected' | 'manual'
    wizardNote: null, // FYI text when the wizard previously found this blocked

    vacant: null,      // 'yes' | 'no'
    futureDated: null, // 'yes' | 'no' — "yes" means a future-dated change exists (bad)
    comment: '',

    copied: false,

    init() {
      this.pullWizardContext();
    },

    // Exposed via window.__pwDeactivation so the wizard's deactivate
    // recommendation can force a fresh pull, the same way the wizard
    // links across to Submission Readiness.
    refresh() {
      this.resetAnswers();
      this.pullWizardContext();
    },

    pullWizardContext() {
      this.mode = 'manual';
      this.wizardNote = null;
      const saved = sessionStorage.getItem('pw-wizard-state');
      if (!saved) return;
      try {
        const parsed = JSON.parse(saved);
        if (parsed.step !== 'recommendation' || !parsed.answers) return;
        if (parsed.answers.deactivateReady === 'yes') {
          // Wizard already confirmed both gating conditions together —
          // carry that across so the manager only needs to draft the
          // comment here, rather than re-answering what's already settled.
          this.mode = 'connected';
          this.vacant = 'yes';
          this.futureDated = 'no';
        } else if (parsed.answers.deactivateReady === 'no') {
          this.wizardNote = 'Your last Decision Wizard session found this position wasn\u2019t ready to deactivate yet. If that\u2019s changed since, answer the two checks below fresh.';
        }
      } catch (e) { /* ignore corrupt state */ }
    },

    resetAnswers() {
      this.vacant = null;
      this.futureDated = null;
      this.comment = '';
    },

    // "Not this one? Check manually instead" — drops the wizard link.
    useManualInstead() {
      this.mode = 'manual';
      this.wizardNote = null;
      this.resetAnswers();
    },

    // ---- The three prerequisites ----
    get vacantCheck() {
      if (this.vacant === null) return { status: 'pending', text: 'Confirm there is currently no incumbent in this position.' };
      if (this.vacant === 'yes') return { status: 'pass', text: 'No current incumbent — this condition is met.' };
      return { status: 'fail', text: 'SuccessFactors won\u2019t deactivate an occupied position. Resolve the incumbent first — the Decision Wizard\u2019s transfer flow can help if they\u2019re moving elsewhere.' };
    },

    get futureDatedCheck() {
      if (this.futureDated === null) return { status: 'pending', text: 'Confirm whether a future-dated Job Information change is scheduled to move someone into this position.' };
      if (this.futureDated === 'no') return { status: 'pass', text: 'Nothing scheduled to move someone in — this condition is met.' };
      return { status: 'fail', text: 'A future-dated change moving someone in blocks deactivation, even while the position still shows vacant today. Cancel or resolve that change first.' };
    },

    get commentCheck() {
      const v = (this.comment || '').trim();
      if (!v) return { status: 'pending', text: 'Draft the comment explaining why you\u2019re deactivating this position — required, and visible to anyone viewing the position.' };
      if (PW.isGenericDeactivationComment(v)) return { status: 'warn', text: 'This reads as a placeholder rather than an explanation. HR Services and your Finance Business Partner see this comment — say what\u2019s actually happening (e.g. which area the freed-up FTE is going to).' };
      return { status: 'pass', text: 'Explains the reason — ready to paste into the Comment field.' };
    },

    get checks() {
      return [
        { key: 'vacant', title: 'Position is genuinely vacant', status: this.vacantCheck.status, text: this.vacantCheck.text },
        { key: 'future', title: 'No future-dated change moving someone in', status: this.futureDatedCheck.status, text: this.futureDatedCheck.text },
        { key: 'comment', title: 'Reallocation comment drafted', status: this.commentCheck.status, text: this.commentCheck.text },
      ];
    },

    get summary() {
      const failing = this.checks.filter(c => c.status === 'fail');
      const pending = this.checks.filter(c => c.status === 'pending');
      const warning = this.checks.filter(c => c.status === 'warn');
      if (failing.length) return { tone: 'danger', text: `Not ready — ${failing.length} prerequisite${failing.length === 1 ? '' : 's'} not yet met. SuccessFactors will reject the deactivation until ${failing.length === 1 ? 'it\u2019s' : 'they\u2019re'} resolved.` };
      if (pending.length) return { tone: 'info', text: `${pending.length} check${pending.length === 1 ? '' : 's'} still need${pending.length === 1 ? 's' : ''} an answer.` };
      if (warning.length) return { tone: 'warning', text: 'Both SuccessFactors prerequisites are met, but your comment could be more specific before you submit.' };
      return { tone: 'success', text: 'Ready to deactivate — both SuccessFactors prerequisites are met and your comment is drafted.' };
    },

    badgeClass(status) {
      return { pass: 'badge-success', fail: 'badge-danger', warn: 'badge-warning', pending: 'badge-brand' }[status] || 'badge-neutral';
    },
    badgeLabel(status) {
      return { pass: 'Pass', fail: 'Not met', warn: 'Check again', pending: 'Incomplete' }[status] || status;
    },

    copySummary() {
      const lines = [];
      lines.push('DEACTIVATION CHECKLIST');
      lines.push('Generated by the Position Wizard (unofficial reference tool) — ' + new Date().toLocaleDateString('en-AU'));
      lines.push('');
      lines.push('Overall: ' + this.summary.text);
      lines.push('');
      this.checks.forEach(c => {
        const tag = { pass: 'PASS', fail: 'NOT MET', warn: 'CHECK AGAIN', pending: 'INCOMPLETE' }[c.status] || c.status.toUpperCase();
        lines.push(`[${tag}] ${c.title}`);
        lines.push('  ' + c.text);
      });
      if ((this.comment || '').trim()) {
        lines.push('');
        lines.push('DRAFT COMMENT:');
        lines.push('  ' + this.comment.trim());
      }
      lines.push('');
      lines.push('STEPS IN SUCCESSFACTORS:');
      PW.DEACTIVATE_STEPS.forEach((s, i) => lines.push(`  ${i + 1}. ${s.title}` + (s.body ? ` — ${s.body}` : '')));
      lines.push('');
      lines.push('This is an unofficial reference tool — confirm anything unusual with HR Services before submitting: ' + PW.HELP_URL);
      navigator.clipboard.writeText(lines.join('\n')).then(() => {
        this.copied = true;
        setTimeout(() => { this.copied = false; }, 2200);
      });
    },
  }));

  /* ============================================================
     FTE & HOURS CALCULATOR — 2.3
     ------------------------------------------------------------
     Two-way arithmetic for the one relationship that sits behind
     Target FTE, arguably the single most consequential field in the
     whole record: Hours = FTE \u00d7 standard week (38, net of ADO
     accrual, unless overridden for a genuinely different EBA). Auto-
     flags the Multiple Holders Allowed rule the instant FTE goes
     above 1.0 \u2014 the same rule the Submission Readiness Check
     cross-checks again right before a manager actually submits.
     ============================================================ */
  Alpine.data('fteCalc', () => ({
    standardHoursInput: String(PW.STANDARD_FTE_HOURS),
    fte: '1',
    hours: String(PW.STANDARD_FTE_HOURS),

    quickValues: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
    referenceValues: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.5, 2.0],

    get standardHours() {
      const n = parseFloat(this.standardHoursInput);
      return (!isNaN(n) && n > 0) ? n : PW.STANDARD_FTE_HOURS;
    },

    // Target FTE is the Finance-approved figure \u2014 if the standard
    // week changes, keep FTE fixed and recompute Hours against it,
    // rather than the other way round.
    onStandardHoursInput(val) {
      this.standardHoursInput = val;
      const f = parseFloat(this.fte);
      if (!isNaN(f)) this.hours = PW.fteToHours(f, this.standardHours);
    },

    onFteInput(val) {
      this.fte = val;
      const f = parseFloat(val);
      this.hours = (val === '' || isNaN(f)) ? '' : PW.fteToHours(f, this.standardHours);
    },

    onHoursInput(val) {
      this.hours = val;
      const h = parseFloat(val);
      this.fte = (val === '' || isNaN(h)) ? '' : PW.hoursToFte(h, this.standardHours);
    },

    quickFill(v) {
      this.fte = String(v);
      this.hours = PW.fteToHours(v, this.standardHours);
    },

    hoursFor(v) { return PW.fteToHours(v, this.standardHours); },

    get fteNum() {
      const n = parseFloat(this.fte);
      return isNaN(n) ? null : n;
    },
    get multipleHoldersFlag() { return this.fteNum !== null && this.fteNum > 1; },
  }));

  /* ============================================================
     VISUAL POSITION LIFECYCLE MAP — 2.6
     ------------------------------------------------------------
     Guide 7's full cycle (submit \u2192 approve \u2192 activate \u2192 recruit \u2192
     amend \u2192 deactivate) as a clickable stage chain. "You are here"
     is derived from whichever tool the manager was using right
     before opening this map (Alpine.store('nav').previous, via
     PW.VIEW_TO_LIFECYCLE_STAGE) and only re-evaluated when nav.view
     actually changes to 'lifecycle' \u2014 so clicking between stages
     while already here never overrides what they're browsing.
     ============================================================ */
  Alpine.data('lifecycleMap', () => ({
    selected: 'submit',
    enteredFor: null,

    onEnter() {
      if (Alpine.store('nav').view !== 'lifecycle') return;
      const prev = Alpine.store('nav').previous;
      if (this.enteredFor === prev) return;
      this.enteredFor = prev;
      this.selected = PW.VIEW_TO_LIFECYCLE_STAGE[prev] || 'submit';
    },

    get stages() { return PW.LIFECYCLE_STAGES; },
    get activeStage() { return this.stages.find(s => s.id === this.selected) || this.stages[0]; },
    get hereStageId() { return PW.VIEW_TO_LIFECYCLE_STAGE[Alpine.store('nav').previous] || null; },

    select(id) { this.selected = id; },

    stageLabel(id) {
      const s = this.stages.find(x => x.id === id);
      return s ? s.label : '';
    },

    // Navigates to the linked tool, then (for the one field-anchored
    // link, Recruit \u2192 "To be Recruited") asks fieldRef to expand and
    // scroll to that exact field once the section is actually visible.
    openTool(tool) {
      Alpine.store('nav').go(tool.view);
      if (tool.field) {
        this.$nextTick(() => {
          window.__pwFieldRef && window.__pwFieldRef.openField(tool.field);
        });
      }
    },
  }));
});

/* ---------- Browser back/forward sync ----------
   Keeps window.history in step with the app so a hardware/gesture
   back press lands on the previous tool or wizard question instead
   of leaving the page. */
function pwSnapshotState() {
  const nav = Alpine.store('nav');
  const state = { view: nav.view, previous: nav.previous };
  const w = window.__pwWizard;
  if (nav.view === 'wizard' && w) {
    state.wizardStep = w.step;
    state.wizardHistory = [...w.history];
    state.wizardAnswers = { ...w.answers };
    state.wizardTrail = [...w.trail];
  }
  return state;
}

function pwPushState() {
  history.pushState(pwSnapshotState(), '', '');
}

function pwApplyState(state) {
  const nav = Alpine.store('nav');
  nav.previous = (state && state.previous) || 'home';
  nav.view = (state && state.view) || 'home';
  Alpine.store('ui').closeSidebar();
  const w = window.__pwWizard;
  if (nav.view === 'wizard' && w && state) {
    w.step = state.wizardStep || 'start';
    w.history = state.wizardHistory || [];
    w.answers = state.wizardAnswers || {};
    w.trail = state.wizardTrail || [];
    w.multiTemp = [];
    w.persist();
  }
}

window.addEventListener('popstate', (e) => pwApplyState(e.state));

/* ---------- Glossary tooltips (hover-primary, delegated) ----------
   .glossary-term spans are injected as raw HTML by PW.glossarize() (and a
   few are hand-written directly in index.html), so Alpine directives never
   bind to them -- these delegated listeners drive the shared $store.glossary
   popover instead. Hover/focus is the main path; click/tap is the fallback
   for touch devices, which never fire hover events. */
let pwGlossaryHoverTimer = null;

document.addEventListener('mouseover', (e) => {
  const el = e.target.closest('.glossary-term');
  if (!el) return;
  clearTimeout(pwGlossaryHoverTimer);
  pwGlossaryHoverTimer = setTimeout(() => Alpine.store('glossary').show(el.dataset.term, el), 120);
});

document.addEventListener('mouseout', (e) => {
  const el = e.target.closest('.glossary-term');
  if (!el) return;
  clearTimeout(pwGlossaryHoverTimer);
  Alpine.store('glossary').close();
});

document.addEventListener('focusin', (e) => {
  const el = e.target.closest('.glossary-term');
  if (el) Alpine.store('glossary').show(el.dataset.term, el);
});

document.addEventListener('focusout', (e) => {
  const el = e.target.closest('.glossary-term');
  if (el) Alpine.store('glossary').close();
});

// Capture phase: a glossary term can sit inside a clickable ancestor (a
// home-page tool card, a wizard choice tile, etc.), so this must intercept
// the click before it bubbles up and triggers that ancestor's own handler.
document.addEventListener('click', (e) => {
  const store = Alpine.store('glossary');
  const el = e.target.closest('.glossary-term');
  if (el) {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(pwGlossaryHoverTimer);
    if (store.open && store.id === el.dataset.term) store.close();
    else store.show(el.dataset.term, el);
    return;
  }
  if (store.open && !e.target.closest('.glossary-popover')) store.close();
}, true);

document.addEventListener('keydown', (e) => {
  const el = e.target.closest && e.target.closest('.glossary-term');
  if (el && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    Alpine.store('glossary').show(el.dataset.term, el);
    return;
  }
  if (e.key === 'Escape') Alpine.store('glossary').close();
});

window.addEventListener('scroll', () => Alpine.store('glossary').close(), { passive: true, capture: true });
window.addEventListener('resize', () => Alpine.store('glossary').close());