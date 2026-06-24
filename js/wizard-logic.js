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

  /* Five possible endpoints, not two. Priority order matters: a
     transfer/individual-variation/deactivate outcome is decided by its
     own branch and should win outright over the generic create/amend
     fallback, even if some create/amend answers also happen to be
     present in session state from earlier navigation. */
  function derivePath(answers) {
    if (answers.transferOutcome) return 'transfer';
    if (answers.individualChange) return 'individual-variation';
    if (answers.deactivateReady === 'yes') return 'deactivate';
    if (answers.employeeStatusChange) return 'create';
    return answers.intent === 'change' ? 'amend' : 'create';
  }

  /* ---------- Step definitions (the question tree) ---------- */
  function getStepDef(step, answers) {
    switch (step) {
      case 'start':
        return {
          tag: 'Let\u2019s figure this out', title: 'Is this about the position itself, or about one specific employee?',
          sub: 'This decides which path we take you down.', type: 'single', key: 'scope',
          options: [
            { value: 'position', label: 'The position itself', sub: 'Creating one, changing its details, or retiring it from the structure.', next: 'position-intent' },
            { value: 'person', label: 'One specific employee', sub: 'Moving them somewhere else, or changing their own hours, classification, or status.', next: 'person-moving' },
          ],
        };

      case 'position-intent':
        return {
          tag: 'About the position', title: 'What are you trying to do?', sub: null, type: 'single', key: 'intent',
          options: [
            { value: 'new', label: 'Add a brand-new position to the structure', sub: 'A role that doesn\u2019t exist yet anywhere in your area.', next: 'create-duplicate-check' },
            { value: 'change', label: 'Change something about a position that already exists', sub: 'FTE, title, reporting line, cost centre, classification, or similar.', next: 'occupied' },
            { value: 'deactivate', label: 'Retire a position from the structure', sub: 'Remove it entirely and free up its budgeted FTE for reallocation.', next: 'deactivate-check' },
            { value: 'unsure', label: 'I\u2019m not sure which one I need', sub: 'Walk me through the fundamentals instead.', next: 'fundamentals' },
          ],
        };

      case 'person-moving':
        return {
          tag: 'About this employee', title: 'Are you moving them to a different position?',
          sub: 'This could be a transfer to another cost centre, ward, or department.',
          type: 'single', key: 'personMoving',
          options: [
            { value: 'yes', label: 'Yes \u2014 they\u2019re moving to a different position', next: 'transfer-vacant-check' },
            { value: 'no', label: 'No \u2014 their role stays the same, just their own details are changing', sub: 'Hours, classification, or employment status for this one person.', next: 'individual-scope-check' },
          ],
        };

      case 'individual-scope-check':
        return {
          tag: 'One more check', title: 'Should this change apply only to this person, or to anyone who ever holds this position?',
          sub: 'If it\u2019s genuinely just this individual\u2019s circumstances, you don\u2019t need to touch the Position at all \u2014 that keeps the change localised and avoids affecting any other incumbent.',
          type: 'single', key: 'individualScope',
          options: [
            { value: 'individual', label: 'Just this person', sub: 'E.g. their own hours, grade, or employment status.', next: 'individual-variation-detail' },
            { value: 'structural', label: 'Anyone in this position, going forward', sub: 'It\u2019s really a structural change to the role itself.', next: 'occupied', extra: { intent: 'change' } },
          ],
        };

      case 'individual-variation-detail':
        return {
          tag: 'Individual variation', title: 'What\u2019s changing for them?', sub: null,
          type: 'single', key: 'individualChange',
          whatsNext: 'This stays entirely on the employee\u2019s own Job Information record \u2014 it never touches the Position, so no Position-level approval chain applies here.',
          options: [
            { value: 'hours', label: 'Their hours or working pattern', next: 'recommendation' },
            { value: 'classification', label: 'Their classification or pay scale level', next: 'recommendation' },
            { value: 'employment-status', label: 'Their Employment Status', sub: 'E.g. Part Time \u2194 Full Time.', next: 'recommendation' },
            { value: 'other', label: 'Something else personal to their record', next: 'recommendation' },
          ],
        };

      case 'transfer-vacant-check':
        return {
          tag: 'Before transferring', title: 'Does a matching position already exist where they\u2019re moving to?',
          sub: 'Matching means the same Title, Pay Scale Group, Employee Status, AND Cost Centre at the destination \u2014 check the Position Org Chart to be sure.',
          checkSteps: PW.VACANT_CHECK.steps,
          type: 'single', key: 'transferOutcome',
          whatsNext: 'Moving someone into an existing position is a Job Information change, not a Position edit \u2014 it follows its own approval routing, separate from the Position chain shown elsewhere in this tool.',
          options: [
            { value: 'vacant-exists', label: 'Yes \u2014 and it\u2019s currently vacant', next: 'recommendation' },
            { value: 'occupied-exists', label: 'Yes \u2014 but someone is already in it', sub: 'Only works as a genuine job-share with room left in Target FTE.', next: 'recommendation' },
            { value: 'needs-create', label: 'No matching position exists there', sub: 'A new position needs to be created first, then the employee transferred in.', next: 'create-confirm', extra: { intent: 'new' } },
          ],
        };

      case 'deactivate-check':
        return {
          tag: 'Before deactivating', title: 'Is the position currently vacant, with no future-dated changes moving someone into it?',
          sub: 'Both conditions must be true \u2014 SuccessFactors won\u2019t let you deactivate otherwise.',
          type: 'single', key: 'deactivateReady',
          whatsNext: 'Once deactivated, its budgeted FTE is freed up \u2014 but reallocating that FTE elsewhere is a separate, deliberate step you\u2019ll still need to action yourself.',
          options: [
            { value: 'yes', label: 'Yes \u2014 it\u2019s vacant and nothing is scheduled to move someone in', next: 'recommendation' },
            { value: 'no', label: 'No \u2014 it\u2019s occupied, or someone has a future start date set', next: 'deactivate-blocked' },
          ],
        };

      case 'deactivate-blocked':
        return {
          tag: 'Not yet', title: 'You\u2019ll need to resolve the incumbent first',
          sub: 'SuccessFactors won\u2019t deactivate a position that\u2019s occupied, or that has a future-dated Job Information change moving someone into it. Transfer or resolve that first, then come back.',
          type: 'info', key: 'acknowledgedBlocked',
          options: [{ value: 'transfer', label: 'Take me to the transfer flow for that employee', next: 'person-moving' }],
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
          tag: 'Before you create \u2014 quick check', title: 'Have you checked the Position Org Chart for an existing vacant position that already matches?',
          sub: 'Matching means the same Title, Pay Scale Group, Employee Status, AND Cost Centre. This is the single biggest cause of duplicate \u201cghost\u201d positions across the org \u2014 always worth the two minutes.',
          checkSteps: PW.VACANT_CHECK.steps,
          type: 'single', key: 'duplicateExists',
          options: [
            { value: 'yes', label: 'Yes, a vacant position already matches', next: 'duplicate-redirect' },
            { value: 'no', label: 'No \u2014 I\u2019ve checked, and at least one of those differs or nothing similar exists', next: 'create-confirm' },
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
          whatsNext: 'Once this is approved and active, note its new Position Number straight away \u2014 you\u2019ll need it to raise a recruitment requisition, and SuccessFactors won\u2019t notify you on your homepage when it\u2019s approved.',
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
          whatsNext: 'Answering Yes unlocks two more fields right after this \u2014 a Business Case Number and an attachment upload.',
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
          whatsNext: 'If it\u2019s occupied, the next question asks exactly which fields you\u2019re changing \u2014 so we can flag anything that won\u2019t reach the people already in the role automatically.',
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
          whatsNext: 'On an occupied position, changing the reporting line, cost centre, or classification routes you through one more check \u2014 confirming exactly which fields will reach the people already in the role.',
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
          whatsNext: 'Increasing leads to a business-case question next \u2014 having one ready from Finance cuts your approval chain from 5 stops down to 3.',
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
          whatsNext: 'Next we\u2019ll check every field you\u2019ve selected against the synchronisation rules, and flag clearly if any of them put incumbents\u2019 pay at risk.',
          options: PW.AMENDABLE_SYNC_FIELDS.map(f => ({ value: f.id, label: f.name })),
        };

      default:
        return null;
    }
  }

  /* ---------- Checklist builder ---------- */

  // Shared by the CREATE path and the "Transfer — needs a new position
  // first" sub-path, so the two never drift apart.
  function buildCreateItems(answers) {
    const items = [];
    const add = (fieldId, customNote) => items.push({ fieldId, customNote });
    add('change-reason', 'Select \u201cCreate New Position\u201d via the template position\u2019s Actions menu.');
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
    return items;
  }

  function buildChecklist(path, changeReasonId, answers) {
    const items = [];
    const add = (fieldId, customNote) => items.push({ fieldId, customNote });
    const addCustom = (title, customNote) => items.push({ fieldId: null, title, customNote });

    if (path === 'create') return sortChecklist(buildCreateItems(answers));

    if (path === 'transfer') {
      if (answers.transferOutcome === 'needs-create') {
        const sorted = sortChecklist(buildCreateItems(answers));
        sorted.push({ fieldId: null, title: 'Then transfer the employee in', customNote: 'Once the new position is approved and active, run a Job Information Change on the employee to move them into it \u2014 don\u2019t recreate their employment record.' });
        return sorted;
      }
      if (answers.transferOutcome === 'occupied-exists') {
        addCustom('Confirm Multiple Holders Allowed', 'Check the existing position\u2019s configuration \u2014 this must already be Yes, or this isn\u2019t a safe transfer target.');
        addCustom('Check remaining Target FTE capacity', 'There must be room left on top of the current incumbent(s) for this employee.');
        addCustom('If it doesn\u2019t job-share', 'Create a new Same-Level Position at the destination instead, then transfer the employee into that.');
        return items;
      }
      // vacant-exists
      addCustom('Find the Position Number', 'Open the Position Org Chart, locate the matching vacant position, and record its Position Number.');
      addCustom('Confirm the fundamentals truly match', 'Title, Pay Scale Group, Employee Status (Ongoing/Fixed Term), and Cost Centre must all line up \u2014 don\u2019t transfer in on a near-match.');
      addCustom('Run a Job Information Change', 'On the employee\u2019s record, not the Position \u2014 this updates their reporting line, cost centre, and classification in one action.');
      addCustom('Leave the old position alone', 'Don\u2019t amend their previous position to \u201cbecome\u201d this one \u2014 each department keeps its own position records.');
      return items;
    }

    if (path === 'individual-variation') {
      addCustom('Open the employee\u2019s record, not the Position', 'Navigate to their profile \u2192 Job Information \u2192 Change in Job or Compensation Information.');
      addCustom('Select the matching variation reason', 'Choose the reason that matches what\u2019s actually changing \u2014 hours, classification, or employment status.');
      addCustom('Leave the Position record untouched', 'Editing the Position instead risks pushing the same change onto every other incumbent.');
      return items;
    }

    if (path === 'deactivate') {
      add('change-reason', 'Select \u201cChange Other Position Attributes\u201d.');
      add('status', 'Change from Active to Inactive.');
      add('comment', 'Explain why you\u2019re deactivating \u2014 this is visible to anyone viewing the position.');
      return sortChecklist(items);
    }

    // amend
    add('change-reason', `Select \u201c${PW.CHANGE_REASONS.find(c => c.id === changeReasonId).label}\u201d.`);
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
  function buildCreateSteps(answers) {
    const steps = [];
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

  function buildSteps(path, changeReasonId, answers) {
    if (path === 'create') return buildCreateSteps(answers);

    if (path === 'transfer') {
      if (answers.transferOutcome === 'needs-create') {
        const steps = buildCreateSteps(answers);
        steps.push({ title: 'Transfer the employee in', body: 'After approval, open their record \u2192 Job Information \u2192 Change in Job or Compensation Information \u2192 select the new Position Number.' });
        return steps;
      }
      if (answers.transferOutcome === 'occupied-exists') {
        return [
          { title: 'Open the existing position', body: 'Confirm Multiple Holders Allowed is Yes and check remaining Target FTE capacity.' },
          { title: 'If there\u2019s room', body: 'Open the employee\u2019s record \u2192 Job Information \u2192 Change in Job or Compensation Information \u2192 select this Position Number.' },
          { title: 'If there isn\u2019t room', body: 'Create a new Same-Level position at the destination instead, then transfer the employee into that one.' },
        ];
      }
      return [
        { title: 'Find the matching position', body: 'Search the Position Org Chart by Title and Cost Centre at the destination.' },
        { title: 'Note the Position Number', body: 'You\u2019ll need it for the Job Information Change.' },
        { title: 'Open the employee\u2019s record', body: 'Navigate to their profile, then Job Information.' },
        { title: 'Select Change in Job or Compensation Information', body: 'Choose the transfer reason and enter the new Position Number.' },
        { title: 'Submit', body: 'This follows its own approval routing \u2014 separate from the Position-approval chain described elsewhere in this tool.' },
      ];
    }

    if (path === 'individual-variation') {
      return [
        { title: 'Open the employee\u2019s profile', body: 'Search for them directly rather than going through the Position Org Chart.' },
        { title: 'Job Information \u2192 Take Action \u2192 Change in Job or Compensation Information', body: 'This is a person-level transaction, separate from any Position edit.' },
        { title: 'Enter the new values', body: 'Only what\u2019s actually changing for this person \u2014 hours, classification, or employment status.' },
        { title: 'Submit', body: 'This follows its own approval routing \u2014 separate from the Position approval chain described elsewhere in this tool.' },
      ];
    }

    if (path === 'deactivate') {
      return [
        { title: 'Open the position', body: 'Find it via the Position Org Chart.' },
        { title: 'Show Details \u2192 Edit', body: 'Enter the date this should take effect as the Effective Date.' },
        { title: 'Set Change Reason to Change Other Position Attributes', body: null },
        { title: 'Change Status from Active to Inactive', body: null },
        { title: 'Add a comment explaining why', body: 'Required context for HR Services and your Finance Business Partner \u2014 remember this comment is visible to anyone viewing the position.' },
        { title: 'Submit for approval', body: 'Follows the standard 3-stop \u201cOther Attributes\u201d chain \u2014 manager, HR Services, Finance Business Partner.' },
      ];
    }

    // amend
    const steps = [];
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

  /* ---------- Recommendation-banner metadata ----------
     Keeps the path → eyebrow/icon mapping in one place so index.html
     never needs a five-way ternary chain. */
  const BANNER_META = {
    create: { eyebrow: 'Create a new position', icon: '#i-branch' },
    amend: { eyebrow: 'Amend the existing position', icon: '#i-refresh' },
    transfer: { eyebrow: 'Transfer to another position', icon: '#i-swap' },
    'individual-variation': { eyebrow: 'Individual variation \u2014 not a Position edit', icon: '#i-user' },
    deactivate: { eyebrow: 'Deactivate the position', icon: '#i-power' },
  };

  const INDIVIDUAL_DETAIL = {
    hours: 'You\u2019re only changing this one person\u2019s hours or working pattern \u2014 update it on their Job Information record. Editing the Position would change it for every incumbent.',
    classification: 'You\u2019re only reclassifying this one person \u2014 update it on their Job Information record. Editing the Position\u2019s Pay Scale fields would change it for every incumbent.',
    'employment-status': 'You\u2019re only changing this one person\u2019s Employment Status \u2014 update it on their Job Information record, not the Position.',
    other: 'This is specific to this one person\u2019s record \u2014 use a Change in Job or Compensation Information rather than editing the Position.',
  };

  /* ---------- Full recommendation ---------- */
  function buildRecommendation(answers) {
    const path = derivePath(answers);
    let changeReasonId = null, chainKey = null, changeReasonDef = null;

    if (path === 'create') {
      changeReasonId = 'create'; chainKey = 'create';
      changeReasonDef = PW.CHANGE_REASONS.find(c => c.id === 'create');
    } else if (path === 'amend') {
      changeReasonId = answers.whatChanging || 'other';
      chainKey = changeReasonId === 'fte'
        ? (answers.fteDirection === 'decrease' ? 'fte_decrease' : 'fte_increase')
        : changeReasonId;
      changeReasonDef = PW.CHANGE_REASONS.find(c => c.id === changeReasonId);
    } else if (path === 'deactivate') {
      changeReasonId = 'other'; chainKey = 'other';
      changeReasonDef = PW.CHANGE_REASONS.find(c => c.id === 'other');
    } else if (path === 'transfer' && answers.transferOutcome === 'needs-create') {
      changeReasonId = 'create'; chainKey = 'create';
      changeReasonDef = PW.CHANGE_REASONS.find(c => c.id === 'create');
    }
    // transfer (vacant/occupied-exists) and individual-variation have no
    // formal SF Change Reason or position-approval chain at all — they
    // never touch the Position record, so chainKey stays null.

    const chainEntry = chainKey ? PW.APPROVAL_CHAINS[chainKey] : null;
    const bcRelevant = chainKey === 'create' || chainKey === 'fte_increase';
    const stops = chainEntry ? (bcRelevant ? (answers.businessCase === 'yes' ? chainEntry.withBC : chainEntry.noBC) : chainEntry.noBC) : [];

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
    } else if (path === 'amend') {
      actionLabel = `Amend the existing position \u2014 ${changeReasonDef.label}`;
      actionDetail = changeReasonDef.summary;
    } else if (path === 'deactivate') {
      actionLabel = 'Deactivate the position';
      actionDetail = 'Set Status to Inactive to remove it from the structure and free its budgeted FTE for reallocation elsewhere \u2014 only possible because it\u2019s genuinely vacant with nothing scheduled to move someone in.';
    } else if (path === 'individual-variation') {
      actionLabel = 'Use a Change in Job or Compensation Information \u2014 not a Position edit';
      actionDetail = INDIVIDUAL_DETAIL[answers.individualChange] || INDIVIDUAL_DETAIL.other;
    } else { // transfer
      if (answers.transferOutcome === 'vacant-exists') {
        actionLabel = 'Transfer into the existing vacant position';
        actionDetail = 'A matching vacant position already exists at the destination \u2014 don\u2019t create or amend anything. Note its Position Number, then run a Job Information Change to move the employee in.';
      } else if (answers.transferOutcome === 'occupied-exists') {
        actionLabel = 'Check before transferring into an occupied position';
        actionDetail = 'A matching position exists at the destination, but someone\u2019s already in it. This only works as a genuine job-share \u2014 confirm Multiple Holders Allowed and remaining Target FTE before proceeding, or create a new Same-Level position instead.';
      } else {
        actionLabel = (answers.createType === 'same-level' ? 'Create a Same-Level Position, then transfer the employee in' : 'Create a Lower-Level Position, then transfer the employee in');
        actionDetail = 'No matching position exists at the destination, so it needs to be created first. Once approved and active, run a Job Information Change to move the employee into it.';
      }
    }

    const checklist = buildChecklist(path, changeReasonId, answers);
    const steps = buildSteps(path, changeReasonId, answers);

    let syncWarning = null;
    if (path === 'amend' && answers.occupied === 'yes' && answers.syncFields && answers.syncFields.length) {
      const details = answers.syncFields.map(id => PW.SYNC_RELEVANT_FIELDS.find(f => f.id === id)).filter(Boolean);
      const risky = details.some(f => f.payScaleWarning);
      syncWarning = {
        details, risky,
        text: risky
          ? 'This position is occupied and you\u2019re changing Pay Scale Type / Area / Group. Pay Scale Level will NOT synchronise \u2014 incumbents could end up with a mismatched classification and pay point. Verify every incumbent\u2019s current Pay Scale Level before synchronising.'
          : 'This position is occupied. Open the Synchronisation Risk Checker to confirm exactly which of your changes will reach incumbents automatically.',
        action: risky ? PW.SAFER_ALTERNATIVE : null,
      };
    } else if (path === 'amend' && answers.occupied === 'yes' && (changeReasonId === 'other' || changeReasonId === 'classification')) {
      syncWarning = { details: [], risky: false, text: 'This position is occupied. Open the Synchronisation Risk Checker before submitting to confirm exactly what will and won\u2019t reach your incumbents.', action: null };
    }

    return {
      path, changeReasonId, changeReasonDef, chainKey, stops,
      chainNote: chainEntry ? chainEntry.note : null,
      chainHeadline: chainEntry ? (chainEntry.headline || null) : null,
      bannerEyebrow: BANNER_META[path].eyebrow, bannerIcon: BANNER_META[path].icon,
      bcRelevant, bcAnswer: answers.businessCase, actionLabel, actionDetail, checklist, steps, syncWarning,
      createType: answers.createType, fteDirection: answers.fteDirection, occupied: answers.occupied,
      transferOutcome: answers.transferOutcome, individualChange: answers.individualChange,
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

  /* ---------- Plain-text summary (for the Copy button) ----------
     3.3 — trail is the manager's question-by-question decision path
     (an array of { tag, title, answer }), supplied by the wizard's
     Alpine state. Optional/defaults to none so this still works if
     ever called without it. */
  function recommendationToText(rec, scenario, trail) {
    const lines = [];
    lines.push('POSITION MANAGEMENT \u2014 RECOMMENDATION SUMMARY');
    lines.push('Generated by the Position Wizard (unofficial reference tool) \u2014 ' + new Date().toLocaleDateString('en-AU'));
    lines.push('');
    lines.push('ACTION: ' + rec.actionLabel);
    lines.push(rec.actionDetail);
    lines.push('');
    if (rec.changeReasonDef) lines.push('Change Reason to select: ' + rec.changeReasonDef.label);
    if (rec.stops.length) {
      lines.push('');
      lines.push(`APPROVAL CHAIN (${rec.stops.length} ${rec.stops.length === 1 ? 'step' : 'steps'}):`);
      rec.stops.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
      if (rec.chainHeadline) lines.push('  ' + rec.chainHeadline);
      lines.push(rec.chainNote);
    } else {
      lines.push('');
      lines.push('APPROVAL CHAIN: Not applicable \u2014 this isn\u2019t a Position-level change, so the position-approval chain doesn\u2019t apply. It follows its own (separate) routing.');
    }
    lines.push('');
    lines.push('FIELD CHECKLIST:');
    rec.checklist.forEach(item => {
      const f = item.fieldId ? field(item.fieldId) : null;
      const label = item.title || (f ? f.name : 'Also check');
      lines.push(`  - ${label}: ${item.customNote || (f ? f.enter : '')}`);
    });
    if (rec.syncWarning) {
      lines.push('');
      lines.push('SYNCHRONISATION NOTE:');
      lines.push('  ' + rec.syncWarning.text);
      if (rec.syncWarning.action) lines.push('  Recommended action: ' + rec.syncWarning.action.label);
    }
    lines.push('');
    lines.push('STEPS IN SUCCESSFACTORS:');
    rec.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s.title}` + (s.body ? ` \u2014 ${s.body}` : '')));
    if (scenario) {
      lines.push('');
      lines.push('SIMILAR REAL CASE \u2014 ' + scenario.title + ':');
      lines.push('  ' + scenario.action);
    }
    if (trail && trail.length) {
      lines.push('');
      lines.push('DECISION PATH (how this recommendation was reached):');
      trail.forEach((t, i) => lines.push(`  ${i + 1}. ${t.title} \u2192 ${t.answer}`));
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