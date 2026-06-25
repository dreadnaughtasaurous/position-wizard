/* =============================================================
   Position Wizard — Position Title Naming-Convention Schema
   -----------------------------------------------------------
   2.2 — Position Title Builder & Naming-Convention Validator.

   Source basis: the nine enterprise agreements / awards actually
   in force across the Victorian public health sector (and named
   for Austin Health specifically), researched against the Fair
   Work Commission record and VHIA implementation bulletins:

     1. Nurses and Midwives (Victorian Public Sector) (Single
        Interest Employers) Enterprise Agreement 2024–2028
     2. Allied Health Professionals (Victorian Public Sector)
        (Single Interest Employers) Enterprise Agreement 2021–2026
     3. Medical Specialists (Victorian Public Health Sector)
        (AMA Victoria/ASMOF) (Single Interest Employers) Enterprise
        Agreement 2022–2026
     4. Doctors in Training (Victorian Public Health Sector)
        (AMA Victoria/ASMOF) (Single Interest Employers) Enterprise
        Agreement 2022–2026
     5. Medical Scientists, Pharmacists and Psychologists
        (Victorian Public Sector) (Single Interest Employers)
        Enterprise Agreement 2021–2025
     6. Health and Allied Services, Managers and Administrative
        Workers (Victorian Public Sector) (Single Interest
        Employers) Enterprise Agreement 2021–2025
     7. Biomedical Engineers (Victorian Public Sector) (Single
        Interest Employers) Enterprise Agreement 2024–2028
     8. Children's Services Award 2010 [MA000120]
     9. Victorian Public Mental Health Services Enterprise
        Agreement 2024–2028

   A note on #7: the brief that prompted this tool named the
   Biomedical Engineers agreement "2025–2028". Every primary source
   found while researching this (Peter MacCallum, Western Health,
   and dated careers.vic.gov.au job ads) names it "2024–2028" — that
   is what's encoded below. Worth a quick double-check locally in
   case Austin is tracking a separate renegotiation.

   This file is a best-effort external model of real award/EBA
   classification structures, built for *title hygiene* (consistent
   naming for reporting and search) — it is deliberately not a pay
   calculator and doesn't encode full pay-point/increment tables.
   Exactly as the original brief flagged: confirm Austin's actual
   local title conventions with HR Services before treating this as
   gospel, especially for grade ranges and senior/principal tiers,
   which are the most likely to have local variations.
   ============================================================= */

window.PW = window.PW || {};

/* ── Shared structural rules, applied regardless of which EBA
      a title belongs to. Adapted from the uploaded naming-validator
      schema's "rules" / "abbreviations" / "modifiers" sections, kept
      to patterns rather than an exhaustive grammar. ── */
PW.TITLE_RULES = {
  delimiter: '\u2013', // en dash " \u2013 ", used to separate role from specialty/unit
  delimiterSpaced: ' \u2013 ',

  // Patterns that should never appear in a Position Title, regardless
  // of EBA. Checked first, before any EBA-specific logic, because
  // these are wrong independent of which agreement applies.
  prohibited: [
    { test: /^\s*\d/, message: 'Don\u2019t start a title with a number \u2014 numeric prefixes (ward numbers, cost-centre digits) belong in Cost Centre, not the title.' },
    { test: /\b(annual|personal|carer'?s?|conference|mat(?:ernity)?)\s+leave\b/i, message: 'Leave information doesn\u2019t belong in the title \u2014 use the Comment field for fixed-term end dates or other context.' },
    { test: /\brelieving\s+cover\b/i, message: '\u201cRelieving cover\u201d describes a temporary arrangement, not the position itself \u2014 use the substantive title and capture the arrangement elsewhere.' },
    { test: /^(test|dummy|null|n\/a|tbc|tba)\b/i, message: 'This reads like a placeholder rather than a real position title.' },
    { test: /\bWD\s*\d+\b/i, message: 'Ward/unit codes (e.g. \u201cWD12\u201d) belong in Cost Centre or Comment, not the title \u2014 use the specialty name instead (e.g. \u201cEmergency Department\u201d).' },
    { test: /\s\/\s/, message: 'A slash combining two roles in one title (\u201cRN / EN\u201d) usually means two separate positions are needed \u2014 pick the primary role, or create both positions.' },
  ],

  // Soft style checks \u2014 worth flagging, never worth a hard fail.
  delimiterVariants: [
    { test: /\s-\s/, message: 'A hyphen (\u201c-\u201d) is being used where the convention is an en dash (\u201c\u2013\u201d) before a specialty or unit \u2014 cosmetic, but worth tidying up for consistent reporting.' },
    { test: /\s\|\s|\s,\s(?=[A-Z])/, message: 'A pipe or comma is being used to separate the specialty/unit \u2014 the convention is an en dash (\u201c \u2013 \u201d).' },
  ],

  // Recognised abbreviations \u2014 expanding these in the title makes
  // search and reporting more reliable, but an abbreviation on its
  // own is a soft warning, not a hard fail (some are genuinely
  // standard, e.g. "RN" is borderline-universal at Austin already).
  abbreviations: {
    RN: 'Registered Nurse', EN: 'Enrolled Nurse', NUM: 'Nurse Unit Manager',
    ANUM: 'Associate Nurse Unit Manager', CNC: 'Clinical Nurse Consultant',
    CNS: 'Clinical Nurse Specialist', CNE: 'Clinical Nurse Educator',
    HMO: 'Hospital Medical Officer', BPT: 'Basic Physician Trainee',
    AT: 'Advanced Trainee', PSA: 'Patient Services Assistant',
    AHP: 'Allied Health Professional',
  },

  // Prefix modifiers some areas use for genuinely temporary cover.
  // Most Austin titles should NOT carry one of these \u2014 the
  // arrangement is usually an Employment Status / Comment matter,
  // not a title word \u2014 so the builder treats this as an opt-in,
  // not a default field.
  prefixModifiers: ['Acting', 'Locum', 'Relieving', 'Visiting', 'Honorary'],
};

/* ── The nine EBAs/Award, each with its real controlled profession
      list and the classifier (if any) that profession takes. ──

   classifier shapes:
     null                                     \u2014 no grade/tier token in the title
     { type:'grade',  options:['Grade 1', ...] }
     { type:'tier',   options:['A','B','C', ...] }   (e.g. Clinical Consultant A\u2013E)
     { type:'code',   options:['NM2','NM3', ...] }   (e.g. Nurse Manager grades)
     { type:'level',  options:['Level 3', ...] }     (e.g. Children's Services)
*/
PW.TITLE_EBAS = [
  {
    id: 'nurses-midwives',
    label: 'Nurses and Midwives (Victorian Public Sector) (Single Interest Employers) Enterprise Agreement 2024\u20132028',
    short: 'Nurses & Midwives',
    years: '2024\u20132028',
    payScaleHint: 'Nurses and Midwives (Victorian Public Sector) Enterprise Agreement',
    titlePattern: '{Profession}{ Grade} \u2013 {Specialty}',
    professions: [
      { name: 'Registered Nurse', classifier: { type: 'grade', options: ['Grade 2', 'Grade 3', 'Grade 4'] } },
      { name: 'Midwife', classifier: { type: 'grade', options: ['Grade 2', 'Grade 3', 'Grade 4'] } },
      { name: 'Enrolled Nurse', classifier: null },
      { name: 'Clinical Nurse Specialist', classifier: null },
      { name: 'Clinical Nurse Educator', classifier: null },
      { name: 'Clinical Nurse Consultant', classifier: { type: 'tier', options: ['A', 'B', 'C', 'D', 'E'] } },
      { name: 'Associate Nurse Unit Manager', classifier: null },
      { name: 'Nurse Unit Manager', classifier: null },
      { name: 'Nurse Manager', classifier: { type: 'code', options: ['NM2', 'NM3', 'NM4'] } },
      { name: 'Nurse Practitioner', classifier: null },
      { name: 'Director of Nursing', classifier: null },
      { name: 'Director of Midwifery', classifier: null },
    ],
    examples: ['Registered Nurse Grade 2 \u2013 Emergency Department', 'Clinical Nurse Consultant C \u2013 Diabetes Education', 'Associate Nurse Unit Manager \u2013 Cardiology', 'Nurse Practitioner \u2013 Pain Management'],
    notes: ['Employee Status (Ongoing vs Fixed Term) is a separate field \u2014 never write \u201cFixed Term\u201d into the title itself.'],
  },
  {
    id: 'allied-health',
    label: 'Allied Health Professionals (Victorian Public Sector) (Single Interest Employers) Enterprise Agreement 2021\u20132026',
    short: 'Allied Health Professionals',
    years: '2021\u20132026',
    payScaleHint: 'Allied Health Professionals (Victorian Public Sector) Enterprise Agreement',
    titlePattern: '{Profession} {Grade} \u2013 {Specialty}',
    professions: [
      { name: 'Physiotherapist', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4'] } },
      { name: 'Occupational Therapist', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4'] } },
      { name: 'Social Worker', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4'] } },
      { name: 'Speech Pathologist', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4'] } },
      { name: 'Dietitian', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4'] } },
      { name: 'Exercise Physiologist', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3'] } },
      { name: 'Podiatrist', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3'] } },
      { name: 'Audiologist', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3'] } },
      { name: 'Orthoptist', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3'] } },
      { name: 'Diversional Therapist', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2'] } },
      { name: 'Genetic Counsellor', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3'] } },
      { name: 'Allied Health Manager', classifier: { type: 'grade', options: ['Grade 3', 'Grade 4'] } },
      { name: 'Medical Imaging Technologist', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4'] } },
      { name: 'Radiation Therapist', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4'] } },
    ],
    examples: ['Physiotherapist Grade 2 \u2013 Neurology', 'Senior Social Worker Grade 3 \u2013 Oncology', 'Speech Pathologist Grade 2 \u2013 Paediatrics', 'Grade 4 Physiotherapist \u2013 Women\u2019s Health'],
    notes: ['A \u201cSenior\u201d prefix or a grade increase should reflect a structural change to the role, not just one incumbent\u2019s personal pay point \u2014 if it\u2019s only about the person, that\u2019s a Job Information change, not a Position Title change.'],
  },
  {
    id: 'medical-specialists',
    label: 'Medical Specialists (Victorian Public Health Sector) (AMA Victoria/ASMOF) (Single Interest Employers) Enterprise Agreement 2022\u20132026',
    short: 'Medical Specialists',
    years: '2022\u20132026',
    payScaleHint: 'Medical Specialists (Victorian Public Health Sector) Enterprise Agreement',
    titlePattern: '{Profession} \u2013 {Specialty}',
    professions: [
      { name: 'Specialist', classifier: null },
      { name: 'Senior Specialist', classifier: null },
      { name: 'Principal Specialist', classifier: null },
      { name: 'Senior Principal Specialist', classifier: null },
      { name: 'Consultant', classifier: null },
      { name: 'Director of Medical Services', classifier: null },
    ],
    examples: ['Specialist \u2013 Cardiology', 'Senior Specialist \u2013 Endocrinology', 'Consultant Psychiatrist', 'Principal Specialist \u2013 Emergency Medicine'],
    notes: ['Many specialties are conventionally folded into a compound noun instead of using the en-dash pattern (\u201cConsultant Cardiologist\u201d, \u201cConsultant Psychiatrist\u201d) \u2014 either pattern is acceptable as long as it\u2019s used consistently for that specialty across cost centres.'],
  },
  {
    id: 'doctors-in-training',
    label: 'Doctors in Training (Victorian Public Health Sector) (AMA Victoria/ASMOF) (Single Interest Employers) Enterprise Agreement 2022\u20132026',
    short: 'Doctors in Training',
    years: '2022\u20132026',
    payScaleHint: 'Doctors in Training (Victorian Public Health Sector) Enterprise Agreement',
    titlePattern: '{Profession} \u2013 {Specialty}',
    professions: [
      { name: 'Intern', classifier: null },
      { name: 'Hospital Medical Officer', classifier: { type: 'code', options: ['HMO2', 'HMO3', 'HMO4'] } },
      { name: 'Basic Physician Trainee', classifier: null },
      { name: 'Advanced Trainee', classifier: null },
      { name: 'Unaccredited Registrar', classifier: null },
      { name: 'Registrar', classifier: null },
      { name: 'Senior Registrar', classifier: null },
      { name: 'Fellow', classifier: null },
    ],
    examples: ['Intern', 'Hospital Medical Officer 2', 'Registrar \u2013 Cardiology', 'Advanced Trainee \u2013 General Medicine', 'Basic Physician Trainee \u2013 General Medicine'],
    notes: ['PGY (postgraduate year) is a training-progress marker, not a title token in SuccessFactors \u2014 use the Intern/HMO/Registrar/Trainee classification with the specialty as the suffix instead.'],
  },
  {
    id: 'medical-scientists-pharm-psych',
    label: 'Medical Scientists, Pharmacists and Psychologists (Victorian Public Sector) (Single Interest Employers) Enterprise Agreement 2021\u20132025',
    short: 'Medical Scientists, Pharmacists & Psychologists',
    years: '2021\u20132025',
    payScaleHint: 'Medical Scientists, Pharmacists and Psychologists (Victorian Public Sector) Enterprise Agreement',
    titlePattern: '{Profession} {Grade} \u2013 {Specialty}',
    professions: [
      { name: 'Medical Scientist', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4'] } },
      { name: 'Senior Medical Scientist', classifier: { type: 'grade', options: ['Grade 4'] } },
      { name: 'Pharmacist', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4'] } },
      { name: 'Senior Pharmacist', classifier: { type: 'grade', options: ['Grade 3', 'Grade 4'] } },
      { name: 'Psychologist', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4'] } },
      { name: 'Senior Psychologist', classifier: { type: 'grade', options: ['Grade 3', 'Grade 4'] } },
      { name: 'Pathology Collector', classifier: null },
      { name: 'Technical Officer', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2'] } },
    ],
    examples: ['Medical Scientist Grade 2 \u2013 Haematology', 'Pharmacist Grade 3 \u2013 Oncology', 'Psychologist Grade 2 \u2013 Adult Mental Health', 'Senior Pharmacist Grade 4 \u2013 Clinical Trials'],
    notes: ['Psychologists sit under this agreement, not Allied Health Professionals \u2014 it\u2019s a common mix-up because they\u2019re clinically adjacent to allied health.'],
  },
  {
    id: 'health-allied-managers-admin',
    label: 'Health and Allied Services, Managers and Administrative Workers (Victorian Public Sector) (Single Interest Employers) Enterprise Agreement 2021\u20132025',
    short: 'Health & Allied Services, Managers & Admin',
    years: '2021\u20132025',
    payScaleHint: 'Health and Allied Services, Managers and Administrative Workers (Victorian Public Sector) Enterprise Agreement',
    titlePattern: '{Profession} {Grade}{ \u2013 Specialty}',
    professions: [
      { name: 'Administrative Officer', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7'] } },
      { name: 'Administration Officer', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7'] } },
      { name: 'Ward Clerk', classifier: null },
      { name: 'Patient Services Assistant', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2'] } },
      { name: 'Executive Assistant', classifier: null },
      { name: 'Clerk', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3'] } },
      { name: 'Coordinator', classifier: { type: 'grade', options: ['Grade 4', 'Grade 5', 'Grade 6'] } },
      { name: 'Manager', classifier: { type: 'grade', options: ['Grade 5', 'Grade 6', 'Grade 7'] } },
      { name: 'Director', classifier: null },
    ],
    examples: ['Administrative Officer Grade 2 \u2013 Outpatients', 'Patient Services Assistant Grade 1', 'Ward Clerk \u2013 Emergency Department', 'Coordinator Grade 5 \u2013 Volunteer Services'],
    notes: ['Generic titles like \u201cCoordinator\u201d or \u201cManager\u201d on their own are hard to search and report on \u2014 always add the specialty/unit suffix for these.'],
  },
  {
    id: 'biomedical-engineers',
    label: 'Biomedical Engineers (Victorian Public Sector) (Single Interest Employers) Enterprise Agreement 2024\u20132028',
    short: 'Biomedical Engineers',
    years: '2024\u20132028',
    payScaleHint: 'Biomedical Engineers (Victorian Public Sector) Enterprise Agreement',
    titlePattern: '{Profession}{ \u2013 Specialty}',
    professions: [
      { name: 'Biomedical Technician', classifier: null },
      { name: 'Biomedical Engineer', classifier: null },
      { name: 'Senior Biomedical Engineer', classifier: null },
      { name: 'Principal Biomedical Engineer', classifier: null },
    ],
    examples: ['Biomedical Engineer', 'Senior Biomedical Engineer \u2013 Imaging Equipment', 'Biomedical Technician'],
    notes: ['Grade bands for this agreement weren\u2019t independently verifiable from public sources at the same depth as the others \u2014 confirm Austin\u2019s exact local title for this stream with HR/Biomedical Engineering before relying on this list alone.'],
  },
  {
    id: 'childrens-services',
    label: 'Children\u2019s Services Award 2010 [MA000120]',
    short: 'Children\u2019s Services Award',
    years: 'N/A (national Award, not an EBA)',
    payScaleHint: 'Children\u2019s Services Award 2010',
    titlePattern: '{Profession} {Level}',
    professions: [
      { name: 'Children\u2019s Services Employee', classifier: { type: 'level', options: ['Level 1', 'Level 2', 'Level 3 \u2014 Qualified Educator', 'Level 4 \u2014 Experienced Educator', 'Level 5 \u2014 Advanced Educator'] } },
      { name: 'Coordinator (Children\u2019s Services)', classifier: { type: 'level', options: ['Level 6'] } },
      { name: 'Director (Children\u2019s Services)', classifier: { type: 'level', options: ['Level 6', 'Level 7'] } },
      { name: 'Assistant Director (Children\u2019s Services)', classifier: { type: 'level', options: ['Level 7'] } },
    ],
    examples: ['Children\u2019s Services Employee Level 3 \u2014 Qualified Educator', 'Director (Children\u2019s Services) Level 6'],
    notes: ['This is a national Award, not a Victorian public-sector EBA \u2014 Austin uses it only for on-site children\u2019s services / early learning roles, never for clinical or corporate positions.'],
  },
  {
    id: 'mental-health-services',
    label: 'Victorian Public Mental Health Services Enterprise Agreement 2024\u20132028',
    short: 'Mental Health Services',
    years: '2024\u20132028',
    payScaleHint: 'Victorian Public Mental Health Services Enterprise Agreement',
    titlePattern: '{Profession}{ Grade} \u2013 {Specialty}',
    professions: [
      { name: 'Mental Health Nurse', classifier: { type: 'grade', options: ['Grade 2', 'Grade 3', 'Grade 4'] } },
      { name: 'Mental Health Officer', classifier: null },
      { name: 'Mental Health Practitioner', classifier: { type: 'grade', options: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4'] } },
      { name: 'Lived Experience Worker', classifier: { type: 'level', options: ['Level 1', 'Level 2', 'Level 3'] } },
      { name: 'Nurse Unit Manager (Mental Health)', classifier: null },
    ],
    examples: ['Mental Health Nurse Grade 2 \u2013 Adult Acute', 'Lived Experience Worker Level 2', 'Mental Health Practitioner Grade 3 \u2013 CAMHS'],
    notes: ['Many mental health roles are still classified under the Nurses & Midwives or Allied Health Professionals agreement depending on discipline \u2014 this agreement\u2019s own classification stream mainly covers Mental Health Officers, Lived Experience Workers, and mental-health-specific nursing/practitioner grades. Confirm which agreement actually applies with HR before relying on title alone.'],
  },
];