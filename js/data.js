/* =============================================================
   Position Wizard — Domain Data
   -----------------------------------------------------------
   Single source of truth for field guidance, scenarios, and
   approval-chain logic. Sourced from Austin Health's internal
   SuccessFactors position-management reference material.
   Edit this file to update guidance — no build step required.
   ============================================================= */

window.PW = window.PW || {};

/* ── Categories (used for Field Reference filter chips) ── */
PW.CATEGORIES = [
  'Workflow & Approval',
  'Identity & Status',
  'Organisational Structure',
  'Employment Type',
  'Classification & Pay',
  'Compliance',
  'Capacity & Recruitment',
];

/* ── The 36 position fields ── */
PW.FIELDS = [
{
    id: 'position-number', n: 1, name: 'Position Number', category: 'Identity & Status', type: 'Auto-generated',
    does: 'A unique 6-digit identifier (700000 range) assigned to every position the moment it is created.',
    enter: 'Nothing — it is generated automatically. Record it the moment you see it; it is how you will find this position again.',
    mistakes: [
      'Forgetting to note the number after submitting, then struggling to find the position later in the Position Org Chart.',
      'Confusing a Position Number with an employee ID — they belong to completely different records.',
    ],
    dependsOn: null, syncs: true, syncNote: 'Updates the Position field on the incumbent\u2019s Job Information record.',
  },
  {
    id: 'change-reason', n: 2, name: 'Change Reason', category: 'Workflow & Approval', type: 'Dropdown',
    does: 'Determines which other fields you are allowed to edit, and which approval chain your request follows.',
    enter: 'Select the reason that matches your intended change: Create New Position, Change Position Title, Change Position Classification, Change Position FTE, or Change Other Position Attributes.',
    mistakes: [
      'Picking the wrong reason and then finding the field you actually need is locked.',
      'Using \u201cChange Position FTE\u201d for a title-only change instead of \u201cChange Position Title\u201d \u2014 each reason unlocks a different, narrower field set.',
    ],
    dependsOn: null, syncs: false, syncNote: 'Workflow only \u2014 does not write to any employee record.',
  },
  {
    id: 'business-case-q', n: 3, name: 'Do you have a business case?', category: 'Workflow & Approval', type: 'Yes / No',
    does: 'Indicates whether Finance has already approved funding for this change. For some change reasons this shortens the approval chain considerably.',
    enter: 'Select Yes only if Finance has signed off on a business case you can attach. Select No if you need to submit before that happens.',
    mistakes: [
      'Selecting No out of convenience when a business case could realistically have been obtained first \u2014 for an FTE increase or new position this can add the Directorate Chief and CEO back into the chain.',
      'Assuming a business case always shortens the chain. It makes no difference at all to \u201cChange Other Position Attributes\u201d or \u201cChange Position Title\u201d, and it never removes the Chief from a Classification change.',
    ],
    dependsOn: null, syncs: false,
  },
  {
    id: 'business-case-number', n: 4, name: 'Business Case Number', category: 'Workflow & Approval', type: 'Free text',
    does: 'Finance\u2019s unique reference number for the approved business case backing this request.',
    enter: 'Format XX.XXX \u2014 two-digit year, three-digit sequence (e.g. 25.042). Use exactly what Finance gave you.',
    mistakes: [
      'Typing it from memory instead of copying it \u2014 this number is checked during approval.',
      'Leaving it blank after answering \u201cYes\u201d to the business case question.',
    ],
    dependsOn: 'Only shown when \u201cDo you have a business case?\u201d = Yes', syncs: false,
  },
  {
    id: 'position-title', n: 5, name: 'Position Title', category: 'Identity & Status', type: 'Free text',
    does: 'The name of the role as it appears on the org chart and in recruitment.',
    enter: 'Use a title that follows naming conventions \u2014 this matters most for EBA-covered roles (e.g. \u201cRegistered Nurse Grade 2\u201d, not \u201cRN2\u201d).',
    mistakes: [
      'Naming the same role differently across cost centres (\u201cRN2\u201d in one ward, \u201cRegistered Nurse Grade 2\u201d in another) \u2014 this quietly breaks reporting and search.',
      'Cramming ward or team detail into the title instead of using the Comment field.',
    ],
    dependsOn: null, syncs: true,
  },
  {
    id: 'status', n: 6, name: 'Status', category: 'Identity & Status', type: 'Active / Inactive',
    does: 'Whether the position currently exists in the live organisational structure.',
    enter: 'Leave as Active almost always. Only set Inactive when retiring a position entirely and reallocating its FTE elsewhere.',
    mistakes: [
      'Setting Inactive while an incumbent is still in the position \u2014 resolve the incumbent first.',
      'Using Inactive for a simply-vacant position that should stay visible for workforce planning.',
    ],
    dependsOn: null, syncs: false,
  },
  {
    id: 'start-date', n: 7, name: 'Start Date', category: 'Identity & Status', type: 'Date',
    does: 'The effective date this position \u2014 or this specific change \u2014 takes effect.',
    enter: 'For new positions, use the intended operational start date. For amendments, use the date the change should take effect.',
    mistakes: [
      'Defaulting to today\u2019s date without checking payroll cut-off implications.',
      'Backdating a change without confirming this is actually intended.',
    ],
    dependsOn: null, syncs: true, syncNote: 'Sets the incumbent\u2019s Position Entry Date.',
  },
  {
    id: 'comment', n: 8, name: 'Comment', category: 'Identity & Status', type: 'Free text',
    does: 'A note attached to the position record, visible to anyone in the organisation who can view that position.',
    enter: 'Use it for fixed-term end dates, ward context, or other detail that does not belong in the formal title.',
    mistakes: [
      'Writing approver-facing notes here \u2014 those belong in the separate comment box shown at submission, not this field.',
      'Putting anything confidential here \u2014 this field is organisation-wide visible.',
    ],
    dependsOn: null, syncs: false,
  },
  {
    id: 'legal-entity', n: 9, name: 'Legal Entity', category: 'Organisational Structure', type: 'Dropdown',
    does: 'The legal organisation that owns the position.',
    enter: 'Always \u201cAustin Health\u201d \u2014 just verify it.',
    mistakes: ['Assuming this needs changing during a restructure \u2014 it essentially never does.'],
    dependsOn: null, syncs: true,
  },
  {
    id: 'directorate', n: 10, name: 'Directorate', category: 'Organisational Structure', type: 'Dropdown',
    does: 'The highest level of the org structure \u2014 your executive reporting line (e.g. Chief Nursing Officer, Chief Medical Officer).',
    enter: 'Verify it matches the executive your area genuinely reports through.',
    mistakes: ['Not noticing this auto-populated incorrectly after using Create Same-Level or Lower-Level from the wrong template position.'],
    dependsOn: null, syncs: true,
  },
  {
    id: 'division', n: 11, name: 'Division', category: 'Organisational Structure', type: 'Dropdown (filtered by Directorate)',
    does: 'The major operational grouping beneath the Directorate.',
    enter: 'Verify it matches your division.',
    mistakes: ['Selecting this before Directorate is correctly set \u2014 the list will not show the right options.'],
    dependsOn: 'Filtered by Directorate', syncs: true,
  },
  {
    id: 'department', n: 12, name: 'Department', category: 'Organisational Structure', type: 'Dropdown (filtered by Division)',
    does: 'The operational unit within the Division, often aligned to a clinical service or corporate function.',
    enter: 'Select the department where the position actually operates.',
    mistakes: ['Letting this auto-populate from a template position without checking it matches your real department.'],
    dependsOn: 'Filtered by Division', syncs: true,
  },
  {
    id: 'sub-department', n: 13, name: 'Sub-Department', category: 'Organisational Structure', type: 'Dropdown (filtered)',
    does: 'Additional granularity beneath Department, where your area uses it.',
    enter: 'Verify if your area uses sub-departments; otherwise leave as default.',
    mistakes: ['Leaving an old sub-department selected after a restructure.'],
    dependsOn: 'Filtered by Department', syncs: true,
  },
  {
    id: 'cost-centre', n: 14, name: 'Cost Centre', category: 'Organisational Structure', type: 'Dropdown',
    does: 'Where the position\u2019s costs are budgeted \u2014 drives financial tracking and reporting.',
    enter: 'Verify carefully. A different cost centre is one of the four fundamentals that decides Create vs Amend.',
    mistakes: [
      'Treating a cost-centre difference as a minor detail \u2014 if no matching position already exists there, you must Create, not Amend.',
      'Not confirming the correct cost centre with your Finance Business Partner before submitting.',
    ],
    dependsOn: null, syncs: true,
  },
  {
    id: 'ph-calendar', n: 15, name: 'PH Calendar', category: 'Organisational Structure', type: 'Dropdown',
    does: 'The public holiday calendar applied to the position.',
    enter: 'Almost always \u201cVIC Metro\u201d for Austin Health positions \u2014 match the actual work location.',
    mistakes: ['Leaving a default that does not match the physical work site.'],
    dependsOn: null, syncs: true,
  },
  {
    id: 'job-role', n: 16, name: 'Job Role', category: 'Organisational Structure', type: 'Dropdown (contextual)',
    does: 'A contextual classification field, often inherited from a template position. Does not directly drive payroll or recruitment processes.',
    enter: 'Select the role matching the classification \u2014 check a similar existing position if unsure.',
    mistakes: ['Spending excessive time deliberating \u2014 it is contextual, not functional.'],
    dependsOn: null, syncs: true,
  },
  {
    id: 'subject-to-position-control', n: 17, name: 'Subject to Position Control', category: 'Organisational Structure', type: 'System-controlled',
    does: 'Enables strict FTE controls on the position. Not editable by managers.',
    enter: 'No action required \u2014 this is managed by HR/system administrators.',
    mistakes: ['Trying to change this \u2014 it is locked deliberately.'],
    dependsOn: null, syncs: false,
  },
  {
    id: 'employee-status', n: 18, name: 'Employee Status', category: 'Employment Type', type: 'Dropdown',
    does: 'Casual / Fixed Term / Ongoing / Director / External \u2014 the primary driver of employment conditions, and the filter for Employment Status below it.',
    enter: 'Select the correct type for this role.',
    mistakes: [
      'Treating an Ongoing \u2192 Fixed Term change as an amendment. It always requires a brand-new position \u2014 Ongoing and Fixed Term must never share a position record, even for an identical role.',
      'Selecting this before confirming with HR whether the role is genuinely fixed-term or ongoing.',
    ],
    dependsOn: null, syncs: false,
  },
  {
    id: 'employment-status', n: 19, name: 'Employment Status', category: 'Employment Type', type: 'Dropdown (filtered by Employee Status)',
    does: 'Full Time / Part Time / Fractional / Casual / Locum and similar \u2014 the working arrangement type.',
    enter: 'Select after Employee Status is set, matching the actual arrangement.',
    mistakes: ['Selecting this before Employee Status \u2014 the list will not show the right options.'],
    dependsOn: 'Filtered by Employee Status', syncs: false,
  },
  {
    id: 'hours-per-week', n: 20, name: 'Hours Per Week', category: 'Employment Type', type: 'Numeric',
    does: 'The standard award hours under the applicable EBA. Excludes ADO hours.',
    enter: 'Enter the standard figure, typically 38.',
    mistakes: ['Entering one incumbent\u2019s rostered hours instead of the standard award figure.'],
    dependsOn: null, syncs: false,
  },
  {
    id: 'pay-scale-type', n: 21, name: 'Pay Scale Type', category: 'Classification & Pay', type: 'Dropdown',
    does: 'The EBA or Award covering this position (e.g. \u201cNurses and Midwives Victorian Public Sector EBA\u201d).',
    enter: 'Select the agreement that actually covers this role.',
    mistakes: ['Selecting a similar-sounding agreement instead of the exact one that applies.'],
    dependsOn: null, syncs: true, payScaleWarning: true,
  },
  {
    id: 'pay-scale-area', n: 22, name: 'Pay Scale Area', category: 'Classification & Pay', type: 'Dropdown (filtered)',
    does: 'The occupational grouping within the selected EBA (e.g. \u201cRegistered Nurses\u201d).',
    enter: 'Select the grouping matching this role\u2019s occupation.',
    mistakes: ['Selecting this before Pay Scale Type \u2014 the list will not filter correctly.'],
    dependsOn: 'Filtered by Pay Scale Type', syncs: true, payScaleWarning: true,
  },
  {
    id: 'pay-scale-group', n: 23, name: 'Pay Scale Group', category: 'Classification & Pay', type: 'Dropdown (filtered)',
    does: 'The classification grade (e.g. RN10, HS1).',
    enter: 'Always select the Year 1 / Level 1 base group \u2014 even if the incumbent will start higher. This preserves maximum recruitment flexibility.',
    mistakes: ['Selecting a higher year/level \u201cbecause that is what the person will be paid\u201d \u2014 this is not what the field is for, and it locks out flexibility on future recruitment.'],
    dependsOn: 'Filtered by Pay Scale Area', syncs: true, payScaleWarning: true,
  },
  {
    id: 'pay-scale-level', n: 24, name: 'Pay Scale Level', category: 'Classification & Pay', type: 'Dropdown (filtered)',
    does: 'The specific pay point within the grade.',
    enter: 'Always select Level 1 \u2014 same reasoning as Pay Scale Group.',
    mistakes: ['Forgetting that this field does NOT synchronise to incumbents \u2014 the single biggest synchronisation risk in the whole system. Always check the Synchronisation Risk Checker before changing Pay Scale Group on an occupied position.'],
    dependsOn: 'Filtered by Pay Scale Group', syncs: false, payScaleWarning: true,
    syncNote: 'Does NOT synchronise, even though Type / Area / Group above it do. This mismatch is the #1 payroll risk in position management.',
  },
  {
    id: 'ahpra', n: 25, name: 'AHPRA Check Required', category: 'Compliance', type: 'Yes / No',
    does: 'Whether the role needs Australian Health Practitioner Regulation Agency registration.',
    enter: 'Yes for regulated health professions \u2014 doctors, nurses, allied health. No for admin/support roles.',
    mistakes: ['Selecting No for an allied health role that does in fact require AHPRA registration.'],
    dependsOn: null, syncs: false,
  },
  {
    id: 'wwcc', n: 26, name: 'Working with Children Check Required', category: 'Compliance', type: 'Yes / No',
    does: 'Whether the role needs a Victorian Working with Children Check.',
    enter: 'Yes for paediatric, maternity, child and adolescent mental health, and any other child-contact role. If in doubt, select Yes and confirm with HR.',
    mistakes: ['Assuming a role has no child contact without checking \u2014 it is far easier to have an unnecessary check than to discover one was required after the fact.'],
    dependsOn: null, syncs: false,
  },
  {
    id: 'immunisation', n: 27, name: 'Immunisation Category', category: 'Compliance', type: 'Dropdown (A / B / C)',
    does: 'Category A (direct blood/body fluid contact), B (indirect contact), or C (minimal/no patient contact) \u2014 drives Victoria\u2019s immunisation requirements for the role.',
    enter: 'Most ward-based clinical roles are Category A; most corporate roles are Category C. Consult Workforce Immunisation or HR if unsure.',
    mistakes: ['Defaulting every clinical-adjacent role to Category A without checking \u2014 admin staff working inside clinical areas are usually B, not A or C.'],
    dependsOn: null, syncs: false,
  },
  {
    id: 'security-licencing', n: 28, name: 'Security Officer Licencing', category: 'Compliance', type: 'Yes / No',
    does: 'Whether the role requires a Victorian security licence under the Private Security Act.',
    enter: 'Yes only for Security Officers and similar licensed security functions.',
    mistakes: ['Selecting Yes for general facilities or car park roles that do not actually perform licensed security functions.'],
    dependsOn: null, syncs: false,
  },
  {
    id: 'ndis-screening', n: 29, name: 'NDIS Screening Required', category: 'Compliance', type: 'Yes / No',
    does: 'Whether the role requires an NDIS Worker Screening Check.',
    enter: 'Yes for Ability@Austin, Orthotics/Prosthetics, and any role with more than incidental contact with NDIS-funded participants.',
    mistakes: ['Assuming this only applies to a small, obvious list of services \u2014 check with HR for borderline roles rather than guessing No.'],
    dependsOn: null, syncs: false,
  },
  {
    id: 'target-fte', n: 30, name: 'Target FTE', category: 'Capacity & Recruitment', type: 'Numeric',
    does: 'The budgeted Full-Time Equivalent for this position \u2014 arguably the single most consequential field in the whole record.',
    enter: 'Enter exactly the FTE Finance has approved (e.g. 1.0, 0.8, 0.6). Never estimate or round.',
    mistakes: [
      'Entering a convenient round number instead of the Finance-approved figure.',
      'Increasing this above 1.0 without also setting Multiple Holders Allowed to Yes.',
    ],
    dependsOn: null, syncs: false,
  },
  {
    id: 'to-be-recruited', n: 31, name: 'To be Recruited', category: 'Capacity & Recruitment', type: 'Yes / No',
    does: 'Whether this position can have a recruitment requisition raised against it once approved.',
    enter: 'Select Yes in almost every case. No is reserved for a position you are creating purely as a structural placeholder, not to actively fill yet.',
    mistakes: ['Selecting No by default, then being unable to raise a requisition later without amending the position first.'],
    dependsOn: null, syncs: false,
  },
  {
    id: 'multiple-holders', n: 32, name: 'Multiple Holders Allowed', category: 'Capacity & Recruitment', type: 'Yes / No',
    does: 'Whether more than one incumbent can sit in this single position record at once \u2014 job-sharing, or FTE split across people.',
    enter: 'Must be Yes if Target FTE is greater than 1.0. Also Yes for genuine job-share arrangements at 1.0 or less.',
    mistakes: ['Leaving this as No after increasing Target FTE above 1.0 \u2014 the position then cannot actually carry the incumbents it is funded for.'],
    dependsOn: null, syncs: false,
  },
  {
    id: 'position-criticality', n: 33, name: 'Position Criticality', category: 'Capacity & Recruitment', type: 'Dropdown (optional)',
    does: 'An informational tag for succession/workforce planning visibility. Has no system-level effect.',
    enter: 'Optional \u2014 set Critical or Non-Critical if your area tracks succession risk this way, otherwise leave blank.',
    mistakes: ['Spending time deliberating over this \u2014 it has zero downstream system impact.'],
    dependsOn: null, syncs: false,
  },
  {
    id: 'kronos-job', n: 34, name: 'Kronos Job', category: 'Capacity & Recruitment', type: 'Dropdown',
    does: 'A broad occupational category used for the UKG Pro (Kronos) timekeeping integration.',
    enter: 'Select the closest matching category \u2014 it drives rostering/timekeeping classification, not pay.',
    mistakes: ['Confusing this with Pay Scale Group \u2014 they serve completely different systems.'],
    dependsOn: null, syncs: true,
  },
  {
    id: 'parent-position', n: 35, name: 'Parent Position', category: 'Organisational Structure', type: 'Position lookup',
    does: 'The position this role reports to \u2014 the literal reporting line shown on the org chart.',
    enter: 'When using Create Same-Level or Create Lower-Level Position this auto-populates from the template \u2014 verify it is actually correct, do not assume.',
    mistakes: [
      'Trusting the auto-populated parent position without checking \u2014 a wrong reporting line is one of the most common org-chart errors.',
      'Forgetting to update this when a role changes manager \u2014 use \u201cChange Other Position Attributes\u201d to fix it.',
    ],
    dependsOn: null, syncs: true,
  },
  {
    id: 'business-case-attachment', n: 36, name: 'Business Case / Justification Attachment', category: 'Workflow & Approval', type: 'File upload',
    does: 'The actual signed-off business case document, attached as evidence for approvers.',
    enter: 'Upload the Finance-approved document \u2014 PDF, DOCX, XLS, PNG, or JPG are all accepted.',
    mistakes: [
      'Attaching a draft instead of the version Finance actually approved.',
      'Answering \u201cYes\u201d to the business case question and then forgetting to attach anything \u2014 approvers will send the request straight back.',
    ],
    dependsOn: 'Only shown when \u201cDo you have a business case?\u201d = Yes', syncs: false,
  },
];

/* ── Synchronisation field-name aliases used by the Sync Checker's
      multi-select — mirrors the fields most commonly changed on an
      occupied position. ── */
PW.SYNC_RELEVANT_FIELDS = PW.FIELDS
  .filter(f => f.syncs !== null)
  .map(f => ({ id: f.id, name: f.name, syncs: f.syncs, note: f.syncNote || null, payScaleWarning: !!f.payScaleWarning }));

/* ── The subset of those fields a manager would actually select when
      amending an occupied position — excludes workflow-only and
      system-controlled fields (Position Number, Change Reason, Status,
      Comment, Legal Entity) that show up in the sync table but are never
      something a manager picks as "what I'm changing". Shared by both
      the standalone Sync Checker and the wizard's sync-fields step so
      the two tools never drift out of sync with each other. ── */
PW.AMENDABLE_SYNC_FIELD_IDS = [
  'position-title', 'cost-centre', 'parent-position', 'directorate', 'division',
  'department', 'sub-department', 'ph-calendar', 'job-role',
  'pay-scale-type', 'pay-scale-area', 'pay-scale-group', 'pay-scale-level', 'kronos-job', 'start-date',
];
PW.AMENDABLE_SYNC_FIELDS = PW.SYNC_RELEVANT_FIELDS.filter(f => PW.AMENDABLE_SYNC_FIELD_IDS.includes(f.id));

/* ── 1. — Change Preview field pickers ─────────────────────────────
   Candidate fields offered when a manager builds a Change Preview for
   "Change Position Classification" or "Change Other Position
   Attributes" — the two reasons where more than one field could be
   changing at once. Position Title and Target FTE have their own
   dedicated Change Reasons, so the tool treats them as fixed
   single-field cases rather than picker lists. Both reuse
   PW.SYNC_RELEVANT_FIELDS so the sync/payroll-risk flags can never
   drift from the canonical per-field data above. ── */
PW.CLASSIFICATION_FIELD_IDS = ['pay-scale-type', 'pay-scale-area', 'pay-scale-group', 'pay-scale-level'];
PW.CLASSIFICATION_FIELDS = PW.SYNC_RELEVANT_FIELDS.filter(f => PW.CLASSIFICATION_FIELD_IDS.includes(f.id));

PW.OTHER_ATTRIBUTE_FIELD_IDS = [
  'parent-position', 'cost-centre', 'directorate', 'division', 'department', 'sub-department',
  'ph-calendar', 'job-role', 'kronos-job', 'start-date',
  'ahpra', 'wwcc', 'immunisation', 'security-licencing', 'ndis-screening',
];
PW.OTHER_ATTRIBUTE_FIELDS = PW.SYNC_RELEVANT_FIELDS.filter(f => PW.OTHER_ATTRIBUTE_FIELD_IDS.includes(f.id));

/* ── Change Reasons and what they unlock ── */
PW.CHANGE_REASONS = [
  {
    id: 'create', label: 'Create New Position',
    summary: 'Used for an entirely new position \u2014 via Create Same-Level or Create Lower-Level from an existing template position.',
  },
  {
    id: 'fte', label: 'Change Position FTE',
    summary: 'Use when only the budgeted FTE is changing \u2014 increase or decrease.',
  },
  {
    id: 'title', label: 'Change Position Title',
    summary: 'Use when only the title is being renamed, with nothing structural changing.',
  },
  {
    id: 'classification', label: 'Change Position Classification',
    summary: 'Use when Pay Scale Type, Area, or Group is changing.',
  },
  {
    id: 'other', label: 'Change Other Position Attributes',
    summary: 'Use for reporting line, cost centre, compliance fields, Status, or anything else not covered by the four reasons above.',
  },
];

/* ── Approval chain matrix ──────────────────────────────────────────
   Each entry: { withBC: [stops], noBC: [stops] }
   Each stop: { role, skipped(optional bool for "with BC" comparison) }
   This is the change-reason-specific logic confirmed against Austin
   Health's actual approval-chain reference (not a flat 5-vs-3 rule). */
const ROLE = {
  manager: '1-up / Cost Centre Manager',
  hr: 'HR Services',
  finance: 'Senior Finance Business Partner',
  chief: 'Directorate Chief',
  ceo: 'Chief Executive Officer',
};

PW.APPROVAL_CHAINS = {
  create: {
    note: 'A business case attachment removes the Directorate Chief and CEO from this chain \u2014 5 stops becomes 3.',
    withBC: [ROLE.manager, ROLE.hr, ROLE.finance],
    noBC: [ROLE.manager, ROLE.hr, ROLE.finance, ROLE.chief, ROLE.ceo],
  },
  fte_increase: {
    note: 'A business case attachment removes the Directorate Chief and CEO from this chain \u2014 5 stops becomes 3.',
    withBC: [ROLE.manager, ROLE.hr, ROLE.finance],
    noBC: [ROLE.manager, ROLE.hr, ROLE.finance, ROLE.chief, ROLE.ceo],
  },
  fte_decrease: {
    headline: 'Manager approval only \u2014 Finance is just notified.',
    note: 'FTE decreases are fast-tracked regardless of a business case \u2014 just your 1-up / Cost Centre Manager, with Finance copied for visibility.',
    withBC: [ROLE.manager],
    noBC: [ROLE.manager],
  },
  classification: {
    headline: 'A business case won\u2019t shorten this chain.',
    note: 'A business case makes no difference here \u2014 the Directorate Chief always reviews a classification change.',
    withBC: [ROLE.manager, ROLE.hr, ROLE.finance, ROLE.chief],
    noBC: [ROLE.manager, ROLE.hr, ROLE.finance, ROLE.chief],
  },
  title: {
    headline: 'A business case won\u2019t shorten this chain.',
    note: 'A business case makes no difference to this chain \u2014 it is identical either way.',
    withBC: [ROLE.manager, ROLE.hr, ROLE.finance],
    noBC: [ROLE.manager, ROLE.hr, ROLE.finance],
  },
  other: {
    headline: 'A business case won\u2019t shorten this chain.',
    note: 'A business case makes no difference to this chain \u2014 it is identical either way.',
    withBC: [ROLE.manager, ROLE.hr, ROLE.finance],
    noBC: [ROLE.manager, ROLE.hr, ROLE.finance],
  },
};

/* ── 1.2 — "Check for an existing vacant position first" gate ──────
   Shown before any CREATE recommendation (and reused by the Transfer
   branch). Without live SF data this can only be a prompt + manual
   checklist, but it targets the #1 mistake named in Guide 2 ("Not
   checking for existing vacant positions before creating a new
   position \u2014 Result: unnecessary position proliferation, budget
   confusion") and the ghost-position cost that follows from it. ── */
PW.VACANT_CHECK = {
  steps: [
    'Open the Position Org Chart from your SuccessFactors homepage.',
    'Search by the Title you need and the destination Cost Centre.',
    'For any match, check its Pay Scale Group and Employee Status (Ongoing vs Fixed Term) \u2014 all four must line up with what you need.',
    'If a vacant match exists, use it \u2014 recruit directly into it, or transfer someone in. Don\u2019t create a duplicate.',
  ],
};

/* ── 2.7 — Deactivation Checklist: Guide 7's "Making Positions
      Inactive" procedure, kept as one shared array so the wizard's own
      deactivate recommendation steps and the standalone Deactivation
      Checklist tool can never drift apart. ── */
PW.DEACTIVATE_STEPS = [
  { title: 'Open the position', body: 'Find it via the Position Org Chart.' },
  { title: 'Show Details \u2192 Edit', body: 'Enter the date this should take effect as the Effective Date.' },
  { title: 'Set Change Reason to Change Other Position Attributes', body: null },
  { title: 'Change Status from Active to Inactive', body: null },
  { title: 'Add a comment explaining why', body: 'Required context for HR Services and your Finance Business Partner \u2014 remember this comment is visible to anyone viewing the position.' },
  { title: 'Submit for approval', body: 'Follows the standard 3-stop \u201cOther Attributes\u201d chain \u2014 manager, HR Services, Finance Business Partner.' },
];

/* Comments that are non-empty but don't actually explain anything —
   Guide 7 requires "a comment explaining why", not a label that just
   restates the action. Matched case-insensitively against the trimmed,
   punctuation-stripped comment. Used by the Deactivation Checklist's
   comment check (wizard-logic.js: isGenericDeactivationComment). ── */
PW.GENERIC_DEACTIVATION_COMMENTS = [
  'deactivating', 'deactivate', 'deactivated', 'deactivating position',
  'inactive', 'inactivating', 'making inactive', 'n/a', 'na', 'none',
  'closing position', 'closed', 'not needed', 'no longer needed', 'tbc', 'see above',
];

/* ── 1.5 — Canonical "safer alternative" action, shared by the
      Synchronisation Risk Checker and the Decision Wizard's sync
      warning so the recommended action never drifts out of sync
      between the two. Sourced from Guide 6's "Safer Ways to Manage
      Changes" table, row 1. ── */
PW.SAFER_ALTERNATIVE = {
  label: 'Use \u201cChange in Job or Compensation Information\u201d instead',
  detail: 'Apply the change directly on the individual incumbent\u2019s record. It updates only that person, never touches the Position, and never risks the other incumbents.',
};

/* ── Real-world scenarios (used as contextual callouts) ── */
PW.SCENARIOS = [
  {
    id: 'A', title: 'FTE increase, same ward',
    situation: '0.8 FTE RN Grade 2 (Ongoing) needs to increase to 1.0 FTE, same ward, nothing else changing.',
    action: 'Amend. Change Reason: Change Position FTE. Update Target FTE to 1.0. Get a Finance business case first \u2014 it drops this from a 5-stop to a 3-stop approval.',
    matches: { path: 'amend', changeReason: 'fte', fteDirection: 'increase' },
  },
  {
    id: 'B', title: 'New ward, new cost centre',
    situation: 'A new ward has opened and needs a 1.0 FTE RN Grade 2 (Ongoing) in a brand-new cost centre.',
    action: 'Create, using Create Same-Level or Create Lower-Level Position from an existing similar position. A new position is required purely because the cost centre differs \u2014 everything else about the role is identical.',
    matches: { path: 'create' },
  },
  {
    id: 'C', title: 'Same role, but Fixed Term',
    situation: 'The same clinical role is needed, but as Fixed Term \u2014 the existing position is Ongoing.',
    action: 'Create. Ongoing and Fixed Term must always be separate positions, even when the title, classification, and duties are completely identical.',
    matches: { path: 'create', employeeStatusChange: true },
  },
  {
    id: 'D', title: 'New manager, same role',
    situation: 'A Senior Speech Pathologist now reports to a newly created Allied Health Manager position.',
    action: 'Amend. Change Reason: Change Other Position Attributes. Update Parent Position. No business case is needed, and approval is fast \u2014 just 3 stops.',
    matches: { path: 'amend', changeReason: 'other' },
  },
  {
    id: 'E', title: 'Cost centre move, multiple incumbents',
    situation: 'A Biomedical Scientist position moves from one cost centre to another within Pathology. The position has 3 incumbents, and all 3 should move with it.',
    action: 'Amend. Change Reason: Change Other Position Attributes. Update Cost Centre and synchronise to incumbents \u2014 safe here because every incumbent genuinely needs the same change.',
    matches: { path: 'amend', changeReason: 'other', occupied: 'yes', syncFields: ['cost-centre'] },
  },
  {
    id: 'F', title: 'Reclassifying an occupied position',
    situation: 'An occupied position needs to be reclassified from Band 3 to Band 4.',
    action: 'Amend with extreme caution. Change Reason: Change Position Classification. Pay Scale Level will NOT synchronise to the incumbent \u2014 this is the highest payroll-risk change in the system. If the change really only applies to one individual rather than the structural role, use Change in Job & Compensation Information on that person\u2019s record instead.',
    matches: { path: 'amend', changeReason: 'classification', occupied: 'yes', syncFields: ['pay-scale-group'] },
  },
  {
    id: 'G', title: 'A team member moving departments',
    situation: 'A PSA Supervisor (1.0 FTE, Ongoing) is transferring from Nursing Administration to the Radiology PSA cost centre, same classification and FTE.',
    action: 'Check the destination cost centre for a matching vacant position first. If one exists (1.0 FTE, Ongoing PSA Supervisor), note its Position Number and run a Job Information change to move the employee in \u2014 no Position edit at all. If nothing matches, the destination needs to create a new Same-Level position before the employee can transfer in. Either way, leave the original position alone \u2014 each department keeps its own positions.',
    matches: { path: 'transfer' },
  },
  {
    id: 'H', title: 'Retiring a vacant position',
    situation: 'A position has sat vacant for some time and the FTE is needed elsewhere. There are no future-dated Job Information changes moving anyone into it.',
    action: 'Deactivate it. Change Reason: Change Other Position Attributes \u2014 set Status to Inactive and add a comment explaining why. This only works while the position is genuinely vacant with nothing scheduled to move someone in; resolve any incumbent or pending transfer first. Once inactive, its FTE is freed up for reallocation.',
    matches: { path: 'deactivate' },
  },
];

/* ── 2.3 — Standard full-time week, in hours, net of ADO accrual.
      Drives the FTE & Hours Calculator's default conversion; Guide 4's
      Hours Per Week field calls this "the standard figure, typically
      38" — the calculator also lets a manager override it for the rare
      EBA that genuinely differs, without this default ever changing. ── */
PW.STANDARD_FTE_HOURS = 38;

/* ── 2.6 — Visual Position Lifecycle Map: Guide 7's full cycle,
      structured so the same six stages drive both the clickable
      stage chain and its detail panel. Each stage lists the in-app
      tool(s) that actually help at that point \u2014 left empty where
      Guide 7 describes something SuccessFactors does automatically,
      with no manager action to take. ── */
PW.LIFECYCLE_STAGES = [
  {
    id: 'submit', n: 1, label: 'Submit', icon: '#i-clipboard', tag: 'Stage 1 of 6',
    summary: 'You complete the position form, click Save then Submit, and the request enters Austin Health\u2019s Delegations of Authority approval workflow.',
    details: [
      'Work out first whether this is a Create, Amend, Transfer, Individual variation, or Deactivate \u2014 the Decision Wizard gets you there in a few questions.',
      'Run the Submission Readiness Check immediately before you click Submit \u2014 it catches the specific gotchas that trigger a Send Back.',
    ],
    tools: [
      { view: 'wizard', label: 'Decide what to submit', icon: '#i-branch' },
      { view: 'preflight', label: 'Run the readiness check', icon: '#i-check-circle' },
    ],
  },
  {
    id: 'approve', n: 2, label: 'Approve', icon: '#i-flow', tag: 'Stage 2 of 6',
    summary: 'Your request moves through a sequence of approvers set by Austin Health\u2019s Delegations of Authority Policy \u2014 how many depends on whether a business case is attached.',
    details: [
      'Without a business case: 1-up / Cost Centre Manager (if required) \u2192 HR Services \u2192 Senior Finance Business Partner \u2192 Directorate Chief \u2192 CEO.',
      'With a business case: 1-up / Cost Centre Manager (if required) \u2192 HR Services \u2192 Senior Finance Business Partner \u2014 done.',
      'Each approver can Approve, Send Back (returns the whole request to you for fixes), or Delegate to someone else.',
    ],
    tools: [
      { view: 'approval', label: 'See your exact chain', icon: '#i-flow' },
    ],
  },
  {
    id: 'activate', n: 3, label: 'Activate', icon: '#i-zap', tag: 'Stage 3 of 6',
    summary: 'Once every approver signs off, the position goes live automatically \u2014 there is nothing further for you to click.',
    details: [
      'The position becomes active in SuccessFactors and appears on your Position Org Chart.',
      'It becomes visible in organisational reports.',
    ],
    tools: [],
  },
  {
    id: 'recruit', n: 4, label: 'Recruit', icon: '#i-user', tag: 'Stage 4 of 6',
    summary: 'If To be Recruited is Yes on the now-active position, you can raise a job requisition against it.',
    details: [
      'From the Position Org Chart, open the position and select Actions > Create Job Requisition',
      'The requisition pre-fills from the position \u2014 title, classification, FTE, and reporting line.',
      'Only one requisition can be open against a position at a time.',
    ],
    tools: [
      { view: 'fields', field: 'to-be-recruited', label: 'Look up \u201cTo be Recruited\u201d', icon: '#i-book' },
    ],
  },
  {
    id: 'amend', n: 5, label: 'Amend', icon: '#i-edit', tag: 'Stage 5 of 6',
    summary: 'Need to change something after creation? Open the position, set an Effective Date, and pick the Change Reason that actually matches what\u2019s changing.',
    details: [
      'Change Reason controls which fields unlock \u2014 FTE, Title, Classification, and Other Attributes each unlock a different set.',
      'If the position has incumbents, decide whether the change should synchronise to their Job Information records \u2014 some fields do, some don\u2019t, and getting a classification change wrong here risks a payroll mismatch.',
    ],
    tools: [
      { view: 'wizard', label: 'Work out the right Change Reason', icon: '#i-branch' },
      { view: 'sync', label: 'Check synchronisation risk', icon: '#i-shield' },
      { view: 'fte', label: 'FTE & Hours Calculator', icon: '#i-calculator' },
    ],
    loopNote: 'Amends are repeatable \u2014 a position can pass through this stage many times over its life.',
  },
  {
    id: 'deactivate', n: 6, label: 'Deactivate', icon: '#i-power', tag: 'Stage 6 of 6',
    summary: 'Retiring a position frees its budgeted FTE for reallocation elsewhere \u2014 but SuccessFactors only allows it under specific conditions.',
    details: [
      'The position must be genuinely vacant, with nothing future-dated already moving someone in.',
      'You\u2019ll add a comment explaining the reallocation \u2014 it\u2019s visible to anyone viewing the position.',
      'Inactive positions disappear from most reports and can\u2019t be used for recruitment.',
    ],
    tools: [
      { view: 'deactivation', label: 'Run the deactivation checklist', icon: '#i-power' },
    ],
    loopNote: 'The FTE freed up here often funds a brand-new position elsewhere \u2014 the cycle returns to Submit.',
  },
];

/* Maps each in-app tool view to the lifecycle stage it belongs to, so
   the Lifecycle Map can mark "you are here" from whichever tool a
   manager was using right before opening it. ── */
PW.VIEW_TO_LIFECYCLE_STAGE = {
  wizard: 'submit',
  preflight: 'submit',
  approval: 'approve',
  sync: 'amend',
  fte: 'amend',
  deactivation: 'deactivate',
};

/* ── Static contact / footer info ── */
PW.HELP_URL = 'https://austinictemr.atlassian.net/servicedesk/customer/portal/80';
PW.DISCLAIMER = 'This is an unofficial support tool built to make Austin Health\u2019s SuccessFactors position-management process easier to navigate. It is not an official Austin Health system and is not a substitute for guidance from HR Services or your Finance Business Partner. Always confirm anything unusual or high-risk before submitting.';