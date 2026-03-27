/**
 * Normalize a git remote URL to a canonical project ID.
 *
 * Input formats:
 *   git@github.com:owner/repo.git
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo.git
 *   ssh://git@github.com:2222/owner/repo.git
 *
 * Output format: github.com:owner:repo (URL-safe, colon-delimited)
 */
export function normalizeRemoteUrl(url) {
  if (!url) return null;

  let normalized = url
    // Strip SSH protocol prefix
    .replace(/^ssh:\/\//, '')
    // Strip HTTPS/HTTP protocol prefix
    .replace(/^https?:\/\//, '')
    // Strip git@ prefix
    .replace(/^git@/, '')
    // Strip port numbers (e.g., :2222/)
    .replace(/:[0-9]+\//, '/')
    // Replace first colon with slash (SSH-style git@host:owner/repo)
    .replace(':', '/')
    // Strip trailing .git
    .replace(/\.git$/, '')
    // Lowercase
    .toLowerCase()
    // Strip trailing slashes
    .replace(/\/+$/, '');

  // Replace all slashes with colons for URL-safe IDs
  normalized = normalized.replace(/\//g, ':');

  return normalized;
}
