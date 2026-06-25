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
    state.wizardTrail = [...w.trail];
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
    w.trail = state.wizardTrail || [];
    w.multiTemp = [];
    w.persist();
  }
}

window.addEventListener('popstate', (e) => pwApplyState(e.state));