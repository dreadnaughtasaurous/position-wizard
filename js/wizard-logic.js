/* =============================================================
   Position Wizard — Decision Engine
   -----------------------------------------------------------
   Pure functions: given the current step + collected answers,
   work out what question to show next, and — once finished —
   build the full recommendation (action, checklist, approval
   chain, SuccessFactors steps, sync warnings).
   ============================================================= */

(function () {
  function field(id) { return PW.FIELDS.find(f => f.id === id); }

  /* Checklist items get pushed in whatever order the logic below
     happens to consider them, which has nothing to do with where a
     manager will actually meet each field while working through the
     position record in SuccessFactors. Re-sort into that real,
     sequential on-screen order (PW.FIELDS[].n — see "Fields in Order
     of Appearance" in the Position Fields reference) so the checklist
     reads top-to-bottom exactly like the form itself. Catch-all notes
     with no specific fieldId (e.g. "Plus whichever of Directorate...
     applies") aren't tied to one field's position, so they're kept at
     the end rather than sorted in. */
  function sortChecklist(items) {
    const withField = items.filter(it => it.fieldId);
    const withoutField = items.filter(it => !it.fieldId);
    withField.sort((a, b) => field(a.fieldId).n - field(b.fieldId).n);
    return [...withField, ...withoutField];
  }

  function derivePath(answers) {
    if (answers.employeeStatusChange) return 'create';
    return answers.intent === 'change' ? 'amend' : 'create';
  }

  /* ---------- Step definitions (the question tree) ---------- */
  function getStepDef(step, answers) {
    switch (step) {
      case 'start':
        return {
          tag: 'Let\u2019s figure this out', title: 'What are you trying to do?', sub: null, type: 'single', key: 'intent',
          options: [
            { value: 'new', label: 'Add a brand-new position to the structure', sub: 'A role that doesn\u2019t exist yet anywhere in your area.', next: 'create-duplicate-check' },
            { value: 'change', label: 'Change something about a position that already exists', sub: 'FTE, title, reporting line, cost centre, classification, or similar.', next: 'occupied' },
            { value: 'unsure', label: 'I\u2019m not sure which one I need', sub: 'Walk me through the fundamentals instead.', next: 'fundamentals' },
          ],
        };

      case 'fundamentals':
        return {
          tag: 'The fundamentals', title: 'Tick anything that\u2019s different from an existing, similar position',
          sub: 'If a position already exists with the exact same Title, Pay Scale Group, Employee Status (Ongoing vs Fixed Term), and Cost Centre, you amend it. If any one of these differs, you create a new position.',
          type: 'multi', key: 'fundamentalsDiff',
          options: [
            { value: 'title', label: 'Position Title is different' },
            { value: 'classification', label: 'Classification (Pay Scale Group) is different' },
            { value: 'employee-status', label: 'Employee Status is different (Ongoing vs Fixed Term)' },
            { value: 'cost-centre', label: 'Cost Centre is different, with no matching position already there' },
            { value: 'none', label: 'None of these \u2014 everything fundamental matches an existing position' },
          ],
        };

      case 'create-duplicate-check':
        return {
          tag: 'Quick check', title: 'Does a position already exist with the exact same Title, Pay Scale Group, Employee Status, AND Cost Centre?',
          sub: 'If all four match an existing position, you don\u2019t need a new one \u2014 you\u2019d amend that one instead.',
          type: 'single', key: 'duplicateExists',
          options: [
            { value: 'yes', label: 'Yes, an identical position already exists', next: 'duplicate-redirect' },
            { value: 'no', label: 'No \u2014 at least one of those differs, or nothing similar exists', next: 'create-confirm' },
          ],
        };

      case 'duplicate-redirect':
        return {
          tag: 'Switching paths', title: 'That means you should amend the existing position, not create a new one',
          sub: 'Creating a duplicate with identical fundamentals causes confusion in the org chart and reporting. Let\u2019s move to the amend flow.',
          type: 'info', key: 'intent',
          options: [{ value: 'change', label: 'Continue to the amend flow', next: 'occupied' }],
        };

      case 'create-confirm':
        return {
          tag: 'Create \u2014 one more detail', title: 'Will this be an additional identical position, or something new?',
          sub: 'This decides whether you\u2019ll use Create Same-Level Position or Create Lower-Level Position in SuccessFactors.',
          type: 'single', key: 'createType',
          options: [
            { value: 'same-level', label: 'Another identical position alongside one that already exists', sub: 'E.g. a second RN Grade 2 in the same ward \u2014 same cost centre, same everything.', next: 'business-case' },
            { value: 'lower-level', label: 'A genuinely new role, cost centre, or reporting line', sub: 'E.g. a new ward, a new manager position, a brand-new grant-funded role.', next: 'business-case' },
          ],
        };

      case 'business-case': {
        const forFte = answers.whatChanging === 'fte' && answers.fteDirection === 'increase';
        return {
          tag: 'Approval impact', title: 'Do you have a Finance-approved business case ready to attach?',
          sub: 'This removes the Directorate Chief and CEO from your approval chain \u2014 5 stops becomes 3.',
          type: 'single', key: 'businessCase',
          options: [
            { value: 'yes', label: 'Yes \u2014 I have it ready to attach', next: 'recommendation' },
            { value: 'no', label: 'No \u2014 I need to submit without one for now', next: 'recommendation' },
          ],
        };
      }

      case 'occupied':
        return {
          tag: 'Before we go further', title: 'Does this position currently have anyone in it?',
          sub: null, type: 'single', key: 'occupied',
          options: [
            { value: 'yes', label: 'Yes, it\u2019s occupied right now', next: 'what-changing' },
            { value: 'no', label: 'No, it\u2019s vacant', next: 'what-changing' },
            { value: 'future', label: 'Vacant, but a future start date is already set for someone', next: 'what-changing' },
          ],
        };

      case 'what-changing':
        return {
          tag: 'What\u2019s changing', title: 'What do you need to change?', sub: null,
          type: 'single', key: 'whatChanging',
          options: [
            { value: 'fte', label: 'The budgeted FTE', next: 'fte-direction' },
            { value: 'other', label: 'Reporting line, cost centre, or another attribute', next: answers.occupied === 'yes' ? 'sync-fields' : 'recommendation' },
            { value: 'classification', label: 'Classification (the pay grade)', next: answers.occupied === 'yes' ? 'sync-fields' : 'recommendation' },
            { value: 'title', label: 'The title only', next: 'recommendation' },
            { value: 'employee-status', label: 'Employee status \u2014 Ongoing \u2194 Fixed Term', next: 'create-confirm', extra: { employeeStatusChange: true } },
          ],
        };

      case 'fte-direction':
        return {
          tag: 'FTE change', title: 'Is the FTE increasing or decreasing?', sub: null,
          type: 'single', key: 'fteDirection',
          options: [
            { value: 'increase', label: 'Increasing', next: 'business-case' },
            { value: 'decrease', label: 'Decreasing', next: 'recommendation' },
          ],
        };

      case 'sync-fields':
        return {
          tag: 'Occupied position', title: 'Which of these are you changing?',
          sub: 'Select everything that applies \u2014 we\u2019ll check each one against the synchronisation rules before you submit.',
          type: 'multi', key: 'syncFields',
          options: PW.AMENDABLE_SYNC_FIELDS.map(f => ({ value: f.id, label: f.name })),
        };

      default:
        return null;
    }
  }

  /* ---------- Checklist builder ---------- */
  function buildChecklist(path, changeReasonId, answers) {
    const items = [];
    const add = (fieldId, customNote) => items.push({ fieldId, customNote });

    add('change-reason', path === 'create'
      ? 'Select \u201cCreate New Position\u201d via the template position\u2019s Actions menu.'
      : `Select \u201c${PW.CHANGE_REASONS.find(c => c.id === changeReasonId).label}\u201d.`);

    if (path === 'create') {
      add('position-title'); add('employee-status'); add('employment-status');
      add('cost-centre'); add('directorate'); add('division'); add('department');
      add('pay-scale-type'); add('pay-scale-area');
      add('pay-scale-group', 'Select the Year 1 / Level 1 base group \u2014 always, regardless of who you expect to recruit.');
      add('pay-scale-level', 'Select Level 1.');
      add('target-fte'); add('multiple-holders', 'Only needs to be Yes if Target FTE is above 1.0, or for a genuine job-share.');
      add('parent-position', 'Verify this rather than trusting the auto-populated value.');
      add('start-date');
      add('business-case-q');
      if (answers.businessCase === 'yes') { add('business-case-number'); add('business-case-attachment'); }
      return sortChecklist(items);
    }

    if (changeReasonId === 'fte') {
      add('target-fte');
      add('multiple-holders', 'Must be Yes if the new Target FTE is above 1.0.');
      if (answers.fteDirection === 'increase') {
        add('business-case-q');
        if (answers.businessCase === 'yes') { add('business-case-number'); add('business-case-attachment'); }
      }
      return sortChecklist(items);
    }
    if (changeReasonId === 'title') {
      add('position-title', 'Check the naming convention is followed, especially for EBA-covered roles.');
      return sortChecklist(items);
    }
    if (changeReasonId === 'classification') {
      add('pay-scale-type'); add('pay-scale-area');
      add('pay-scale-group', 'Select the Year 1 / Level 1 base group.');
      add('pay-scale-level', 'Select Level 1 \u2014 and remember this field will NOT synchronise to any current incumbent.');
      return sortChecklist(items);
    }
    // other
    add('parent-position', 'Update only if the reporting line is actually changing.');
    add('cost-centre', 'Update only if the cost centre is actually changing.');
    add('status', 'Almost always stays Active.');
    items.push({ fieldId: null, customNote: 'Plus whichever of Directorate, Division, Department, Sub-Department, PH Calendar, Job Role, or the Compliance fields actually applies to your change.' });
    return sortChecklist(items);
  }

  /* ---------- SuccessFactors step-by-step builder ---------- */
  function buildSteps(path, changeReasonId, answers) {
    const steps = [];
    if (path === 'create') {
      if (answers.createType === 'same-level') {
        steps.push({ title: 'Open the existing matching position', body: 'Find it in the Position Org Chart \u2014 this is the position you\u2019re duplicating.' });
        steps.push({ title: 'Actions \u2192 Create Same-Level Position', body: 'Most organisational fields copy across automatically from the template.' });
      } else {
        steps.push({ title: 'Open the manager/parent position', body: 'Find the position this new role will report to.' });
        steps.push({ title: 'Actions \u2192 Create Lower-Level Position', body: 'This sets up the new role one level beneath the position you opened.' });
      }
      steps.push({ title: 'Set Change Reason to Create New Position', body: 'This unlocks the full field set for a brand-new position.' });
      steps.push({ title: 'Work through the field checklist above', body: 'Pay particular attention to Target FTE, Parent Position, and the Pay Scale fields \u2014 always Year 1 / Level 1.' });
      if (answers.businessCase === 'yes') steps.push({ title: 'Attach your business case', body: 'Upload the Finance-approved document and enter its reference number.' });
      steps.push({ title: 'Submit', body: 'Note the new Position Number immediately \u2014 you\u2019ll need it to find this position again, and no homepage notification appears once it\u2019s approved.' });
      return steps;
    }

    steps.push({ title: 'Open the existing position', body: 'Search for it by Position Number, or find it in the Position Org Chart.' });
    steps.push({ title: `Set Change Reason to \u201c${PW.CHANGE_REASONS.find(c => c.id === changeReasonId).label}\u201d`, body: 'This unlocks only the fields relevant to this type of change.' });
    steps.push({ title: 'Work through the field checklist above', body: 'Only the unlocked fields for this Change Reason are editable.' });
    if (answers.occupied === 'yes') {
      steps.push({ title: 'Decide on synchronisation', body: 'Before answering \u201cYes, synchronise changes to incumbents\u201d at submission, check the Synchronisation Risk Checker \u2014 not every field reaches incumbent records, and Pay Scale Level never does.' });
    }
    if (changeReasonId === 'fte' && answers.fteDirection === 'increase' && answers.businessCase === 'yes') {
      steps.push({ title: 'Attach your business case', body: 'Upload the Finance-approved document and enter its reference number \u2014 this is what shortens your approval chain.' });
    }
    steps.push({ title: 'Submit', body: 'The change takes effect immediately once final approval is given. There\u2019s no homepage notification \u2014 watch your email for the final approval notice.' });
    return steps;
  }

  /* ---------- Full recommendation ---------- */
  function buildRecommendation(answers) {
    const path = derivePath(answers);
    let changeReasonId, chainKey;

    if (path === 'create') {
      changeReasonId = 'create'; chainKey = 'create';
    } else {
      changeReasonId = answers.whatChanging || 'other';
      chainKey = changeReasonId === 'fte'
        ? (answers.fteDirection === 'decrease' ? 'fte_decrease' : 'fte_increase')
        : changeReasonId;
    }

    const chainEntry = PW.APPROVAL_CHAINS[chainKey];
    const bcRelevant = chainKey === 'create' || chainKey === 'fte_increase';
    const stops = bcRelevant ? (answers.businessCase === 'yes' ? chainEntry.withBC : chainEntry.noBC) : chainEntry.noBC;

    const changeReasonDef = path === 'create'
      ? PW.CHANGE_REASONS.find(c => c.id === 'create')
      : PW.CHANGE_REASONS.find(c => c.id === changeReasonId);

    let actionLabel, actionDetail;
    if (path === 'create') {
      if (answers.createType === 'same-level') {
        actionLabel = 'Create a Same-Level Position';
        actionDetail = 'You\u2019re adding another identical position alongside one that already exists \u2014 same cost centre, same everything.';
      } else {
        actionLabel = 'Create a Lower-Level Position';
        actionDetail = 'You\u2019re adding a genuinely new role, cost centre, or reporting line beneath an existing position.';
      }
      if (answers.employeeStatusChange) {
        actionDetail += ' This is required because Ongoing and Fixed Term positions must always be separate, even for an identical role.';
      }
    } else {
      actionLabel = `Amend the existing position \u2014 ${changeReasonDef.label}`;
      actionDetail = changeReasonDef.summary;
    }

    const checklist = buildChecklist(path, changeReasonId, answers);
    const steps = buildSteps(path, changeReasonId, answers);

    let syncWarning = null;
    if (answers.occupied === 'yes' && answers.syncFields && answers.syncFields.length) {
      const details = answers.syncFields.map(id => PW.SYNC_RELEVANT_FIELDS.find(f => f.id === id)).filter(Boolean);
      const risky = details.some(f => f.payScaleWarning);
      syncWarning = {
        details, risky,
        text: risky
          ? 'This position is occupied and you\u2019re changing Pay Scale Type / Area / Group. Pay Scale Level will NOT synchronise \u2014 incumbents could end up with a mismatched classification and pay point. Verify every incumbent\u2019s current Pay Scale Level before synchronising, or use Change in Job & Compensation Information on an individual record if this only applies to one person.'
          : 'This position is occupied. Open the Synchronisation Risk Checker to confirm exactly which of your changes will reach incumbents automatically.',
      };
    } else if (answers.occupied === 'yes' && (changeReasonId === 'other' || changeReasonId === 'classification')) {
      syncWarning = { details: [], risky: false, text: 'This position is occupied. Open the Synchronisation Risk Checker before submitting to confirm exactly what will and won\u2019t reach your incumbents.' };
    }

    return {
      path, changeReasonId, changeReasonDef, chainKey, stops, chainNote: chainEntry.note,
      bcRelevant, bcAnswer: answers.businessCase, actionLabel, actionDetail, checklist, steps, syncWarning,
      createType: answers.createType, fteDirection: answers.fteDirection, occupied: answers.occupied,
    };
  }

  /* ---------- Scenario matching ----------
     Picks the most specific matching scenario rather than the first loose
     match — several scenarios share a broad trait (e.g. several are
     "path: create"), so matching has to prefer whichever scenario's
     criteria are satisfied most completely. */
  function matchScenario(answers) {
    const path = derivePath(answers);
    const candidates = PW.SCENARIOS.filter(s => {
      const m = s.matches;
      if (m.path && m.path !== path) return false;
      if (m.changeReason && m.changeReason !== answers.whatChanging) return false;
      if (m.fteDirection && m.fteDirection !== answers.fteDirection) return false;
      if (m.occupied && m.occupied !== answers.occupied) return false;
      if (m.employeeStatusChange && !answers.employeeStatusChange) return false;
      if (m.syncFields && !(answers.syncFields && m.syncFields.every(f => answers.syncFields.includes(f)))) return false;
      return true;
    });
    if (!candidates.length) return null;
    candidates.sort((a, b) => Object.keys(b.matches).length - Object.keys(a.matches).length);
    return candidates[0];
  }

  /* ---------- Plain-text summary (for the Copy button) ---------- */
  function recommendationToText(rec, scenario) {
    const lines = [];
    lines.push('POSITION MANAGEMENT \u2014 RECOMMENDATION SUMMARY');
    lines.push('Generated by the Position Wizard (unofficial reference tool) \u2014 ' + new Date().toLocaleDateString('en-AU'));
    lines.push('');
    lines.push('ACTION: ' + rec.actionLabel);
    lines.push(rec.actionDetail);
    lines.push('');
    lines.push('Change Reason to select: ' + rec.changeReasonDef.label);
    lines.push('');
    lines.push(`APPROVAL CHAIN (${rec.stops.length} ${rec.stops.length === 1 ? 'step' : 'steps'}):`);
    rec.stops.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
    lines.push(rec.chainNote);
    lines.push('');
    lines.push('FIELD CHECKLIST:');
    rec.checklist.forEach(item => {
      const f = item.fieldId ? field(item.fieldId) : null;
      lines.push(`  - ${f ? f.name : 'Also check'}: ${item.customNote || (f ? f.enter : '')}`);
    });
    if (rec.syncWarning) {
      lines.push('');
      lines.push('SYNCHRONISATION NOTE:');
      lines.push('  ' + rec.syncWarning.text);
    }
    lines.push('');
    lines.push('STEPS IN SUCCESSFACTORS:');
    rec.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s.title} \u2014 ${s.body}`));
    if (scenario) {
      lines.push('');
      lines.push('SIMILAR REAL CASE \u2014 ' + scenario.title + ':');
      lines.push('  ' + scenario.action);
    }
    lines.push('');
    lines.push('This is an unofficial reference tool \u2014 confirm anything unusual with HR Services before submitting: ' + PW.HELP_URL);
    return lines.join('\n');
  }

  PW.getStepDef = function (step, answers) {
    const def = getStepDef(step, answers);
    if (!def) return def;
    // Resolve option.next functions aren't used (static), but normalise extra:
    def.options = def.options.map(o => ({ extra: {}, ...o }));
    return def;
  };
  PW.buildRecommendation = buildRecommendation;
  PW.matchScenario = matchScenario;
  PW.recommendationToText = recommendationToText;
  PW.derivePath = derivePath;
})();