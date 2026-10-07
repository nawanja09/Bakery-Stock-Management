// server/services/departmentMapper.js
//
// Maps a POS branch name (e.g. "Cafe - M") to an EXISTING Stock Management
// department (e.g. "Cafe"). Pure: the caller passes the department list.
//
// Rule (no per-branch hard-coding):
//   1. An explicit alias, if configured (RAVON_POS_BRANCH_DEPARTMENT_MAP, JSON:
//      {"Savoury - M": "Savory"} or {"Savoury": "Savory"}) - for spelling
//      differences the generic rule cannot know about.
//   2. The full branch name.
//   3. The branch name without its trailing branch-code suffix: the last
//      " - <code>" segment ("Cafe - M" -> "Cafe", "Bakery – KD" -> "Bakery") or a
//      trailing "(code)" ("Cafe (M)" -> "Cafe").
// Names are compared normalized: case, spaces, dashes and punctuation ignored,
// "&" = "and". A candidate must match EXACTLY ONE department; no match or an
// ambiguous match is reported as an error and never guessed. Departments are
// never created here.
//
// Renamed POS departments: some POS branches carry a different name than the
// Stock Management department (POS "MASActive" is "MAS Intimo"). The branch name
// is normalized with normalizePosBranchName() BEFORE storing / displaying /
// matching, so the POS name never reaches the UI; the original stays in the
// record's raw_payload for traceability.

const norm = (s) => String(s ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

// [POS name pattern, Stock Management name]
const POS_DEPARTMENT_RENAMES = [
  [/\bMAS\s*[-_]?\s*Active\b/i, 'MAS Intimo']
];

/** POS branch name with renamed departments replaced ("MASActive - M" -> "MAS Intimo - M"). */
const normalizePosBranchName = (branchName) => {
  if (branchName === null || branchName === undefined) return branchName;
  let name = String(branchName);
  for (const [pattern, replacement] of POS_DEPARTMENT_RENAMES) name = name.replace(pattern, replacement);
  return name;
};

const SUFFIX_PATTERNS = [
  /\s+[-–—]\s+[^-–—]+$/, // "Cafe - M", "Juice Bar – Main"
  /\s*\([^()]*\)\s*$/ // "Cafe (M)"
];

/** Candidate department names for a branch, most specific first. */
const branchCandidates = (branchName) => {
  const name = String(normalizePosBranchName(branchName) ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return [];
  const out = [name];
  for (const pattern of SUFFIX_PATTERNS) {
    const base = name.replace(pattern, '').trim();
    if (base && base !== name && !out.includes(base)) out.push(base);
  }
  return out;
};

const parseAliases = (raw = process.env.RAVON_POS_BRANCH_DEPARTMENT_MAP) => {
  if (!raw || !String(raw).trim()) return new Map();
  try {
    const obj = JSON.parse(raw);
    return new Map(Object.entries(obj).map(([branch, department]) => [norm(branch), String(department)]));
  } catch (error) {
    console.warn('RAVON_POS_BRANCH_DEPARTMENT_MAP is not valid JSON - ignored');
    return new Map();
  }
};

/**
 * Builds a matcher over the department list.
 * @param {Array<{id:number,name:string}>} departments
 * @returns {(branchName:string) => ({ok:true, department:{id,name}} | {ok:false, reason:string})}
 */
const createDepartmentMatcher = (departments, aliases = parseAliases()) => {
  const byNorm = new Map();
  for (const d of departments) {
    const key = norm(d.name);
    if (!byNorm.has(key)) byNorm.set(key, []);
    byNorm.get(key).push(d);
  }
  const lookup = (name) => byNorm.get(norm(name)) || [];

  return (branchName) => {
    const candidates = branchCandidates(branchName);
    if (candidates.length === 0) return { ok: false, reason: 'The POS record has no branch' };

    for (const candidate of candidates) {
      const alias = aliases.get(norm(candidate));
      if (alias !== undefined) {
        const hits = lookup(alias);
        if (hits.length === 1) return { ok: true, department: hits[0] };
        return { ok: false, reason: `Branch "${branchName}" is mapped to department "${alias}", which does not exist` };
      }
    }
    for (const candidate of candidates) {
      const hits = lookup(candidate);
      if (hits.length === 1) return { ok: true, department: hits[0] };
      if (hits.length > 1) {
        return { ok: false, reason: `Branch "${branchName}" matches more than one department (${hits.map((h) => h.name).join(', ')})` };
      }
    }
    return {
      ok: false,
      reason: `No department matches POS branch "${branchName}" (tried: ${candidates.join(', ')})`
    };
  };
};

module.exports = { createDepartmentMatcher, branchCandidates, parseAliases, normalizePosBranchName, normalizeDepartmentName: norm };
