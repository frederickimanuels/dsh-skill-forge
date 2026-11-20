/**
 * Skill validation and publication.
 *
 * The harness validates every candidate its registry returns and throws on a
 * shape violation, which would take the whole provider down for one bad file.
 * This module therefore checks the same contract locally first: a definition
 * that fails is reported and skipped, and everything else still publishes.
 *
 * Two levels are checked, matching the registry: a *candidate* is the catalog
 * entry (no instruction text), a *definition* adds `content` and is what the
 * model finally loads.
 *
 * @module dsh-skill-forge/validate
 */

import { SKILL_NAME } from './adapt.js';

/** Provider name the harness reserves for runtime registrations. */
export const RESERVED_PROVIDER = 'runtime';

/**
 * Check a catalog entry against the registry's candidate contract.
 *
 * @param {unknown} definition - candidate to validate.
 * @param {string} providerName - expected provider name.
 * @param {object} [options] - validation options.
 * @param {boolean} [options.requireContent] - also require non-empty `content`.
 * @returns {string[]} violations; empty when the candidate is publishable.
 */
export function validate(definition, providerName, options = {}) {
  const violations = [];
  if (definition === null || typeof definition !== 'object') return ['definition is not an object'];
  const candidate = definition;

  if (typeof candidate.name !== 'string') violations.push('name is not a string');
  else if (candidate.name.length > 64) violations.push('name "' + candidate.name + '" exceeds 64 characters');
  else if (!SKILL_NAME.test(candidate.name)) violations.push('name "' + candidate.name + '" is not kebab-case (expected /^[a-z0-9]+(?:-[a-z0-9]+)*$/)');

  if (typeof candidate.description !== 'string') violations.push('description is not a string');
  else if (candidate.description.trim().length === 0) violations.push('description is empty');

  const invocation = candidate.invocation;
  if (invocation === null || typeof invocation !== 'object' || typeof invocation.modelInvocable !== 'boolean' || typeof invocation.userInvocable !== 'boolean') {
    violations.push('invocation must be { modelInvocable: boolean, userInvocable: boolean }');
  }
  if (candidate.whenToUse !== undefined && typeof candidate.whenToUse !== 'string') violations.push('whenToUse is not a string');
  if (typeof candidate.source !== 'string') violations.push('source is not a string');
  if (typeof candidate.rank !== 'number' || !Number.isFinite(candidate.rank)) violations.push('rank is not a finite number');
  if (typeof candidate.provider !== 'string') violations.push('provider is not a string');
  else if (candidate.provider !== providerName) violations.push('provider "' + candidate.provider + '" does not match "' + providerName + '"');
  if (candidate.path !== undefined && typeof candidate.path !== 'string') violations.push('path is not a string');

  if (options.requireContent === true) {
    if (typeof candidate.content !== 'string') violations.push('content is not a string');
    else if (candidate.content.trim().length === 0) violations.push('content is empty');
  }
  return violations;
}

/**
 * Decide whether a candidate may be published.
 *
 * @param {Record<string, unknown>} definition - adapted skill.
 * @param {string} providerName - provider name.
 * @returns {{ ok: true } | { ok: false, violations: string[] }} outcome.
 */
export function checkPublishable(definition, providerName) {
  const violations = validate(definition, providerName);
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/**
 * Decide whether a definition may be served to the model.
 *
 * @param {Record<string, unknown>} definition - adapted skill.
 * @param {string} providerName - provider name.
 * @returns {{ ok: true } | { ok: false, violations: string[] }} outcome.
 */
export function checkLoadable(definition, providerName) {
  const violations = validate(definition, providerName, { requireContent: true });
  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}
