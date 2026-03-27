import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRemoteUrl } from '../src/services/project-resolver.js';

describe('normalizeRemoteUrl', () => {
  it('normalizes SSH format', () => {
    assert.equal(
      normalizeRemoteUrl('git@github.com:owner/repo.git'),
      'github.com:owner:repo'
    );
  });

  it('normalizes HTTPS format', () => {
    assert.equal(
      normalizeRemoteUrl('https://github.com/owner/repo'),
      'github.com:owner:repo'
    );
  });

  it('normalizes HTTPS with .git suffix', () => {
    assert.equal(
      normalizeRemoteUrl('https://github.com/owner/repo.git'),
      'github.com:owner:repo'
    );
  });

  it('normalizes SSH with port', () => {
    assert.equal(
      normalizeRemoteUrl('ssh://git@github.com:2222/owner/repo.git'),
      'github.com:owner:repo'
    );
  });

  it('normalizes SSH without .git', () => {
    assert.equal(
      normalizeRemoteUrl('git@github.com:owner/repo'),
      'github.com:owner:repo'
    );
  });

  it('handles GitLab URLs', () => {
    assert.equal(
      normalizeRemoteUrl('git@gitlab.com:group/subgroup/repo.git'),
      'gitlab.com:group:subgroup:repo'
    );
  });

  it('lowercases the result', () => {
    assert.equal(
      normalizeRemoteUrl('git@GitHub.COM:Owner/Repo.git'),
      'github.com:owner:repo'
    );
  });

  it('returns null for empty input', () => {
    assert.equal(normalizeRemoteUrl(null), null);
    assert.equal(normalizeRemoteUrl(''), null);
  });
});
