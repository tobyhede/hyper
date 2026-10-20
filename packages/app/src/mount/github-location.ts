/**
 * A GitHub location, `github:owner/repo@ref/path` (ADR 0130), as written and as
 * resolved.
 *
 * `@ref` and `/path` are each optional. The repository ends at the first `@`,
 * and the ref runs from there to the next `/`, so a ref may contain `@` (as in
 * `release@beta`) but not `/`: a branch named `feature/x` is addressed by its
 * commit SHA instead. The path is relative to the repository root, and every
 * segment of it is a name: no empty, `.` or `..` segment is accepted.
 */
export interface GitHubLocation {
  readonly owner: string;
  readonly repo: string;
  /** `undefined` means the repository's default branch. */
  readonly ref: string | undefined;
  /** `''` means the repository root. */
  readonly path: string;
}

/** A location whose ref has been resolved to the commit it names. */
export interface ResolvedGitHubLocation {
  readonly owner: string;
  readonly repo: string;
  /** A 40-character lower-case commit SHA. */
  readonly sha: string;
  readonly path: string;
}

export interface MalformedGitHubLocation {
  readonly kind: 'malformed-location';
  readonly input: string;
  readonly reason: string;
}

export type GitHubLocationParse =
  | { readonly ok: true; readonly location: GitHubLocation }
  | { readonly ok: false; readonly failure: MalformedGitHubLocation };

const SCHEME = 'github:';

/** GitHub's own rule for a user or organisation name, less its length limit. */
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const REPO = /^[A-Za-z0-9._-]+$/;
/**
 * A ref, by the characters git-check-ref-format refuses: `@` is allowed inside
 * one, but not a ref that is exactly `@` or one containing `@{`.
 */
const REF = /^(?!@$)(?!.*@\{)[^\s/:~^?*[\\]+$/;

const COMMIT_SHA = /^[0-9a-f]{40}$/i;

/** Whether a ref is already a full commit SHA, and so needs no resolution. */
export const isCommitSha = (ref: string): boolean => COMMIT_SHA.test(ref);

const isNameSegment = (segment: string): boolean =>
  segment !== '' && segment !== '.' && segment !== '..';

export const parseGitHubLocation = (input: string): GitHubLocationParse => {
  const malformed = (reason: string): GitHubLocationParse => ({
    ok: false,
    failure: { kind: 'malformed-location', input, reason },
  });

  if (!input.startsWith(SCHEME)) return malformed(`a GitHub location begins with ${SCHEME}`);
  const body = input.slice(SCHEME.length);

  const ownerEnd = body.indexOf('/');
  if (ownerEnd === -1) return malformed('a GitHub location names owner/repo');
  const owner = body.slice(0, ownerEnd);
  if (!OWNER.test(owner)) return malformed(`${JSON.stringify(owner)} is not a GitHub owner`);

  const rest = body.slice(ownerEnd + 1);
  const repoEnd = rest.search(/[@/]/);
  const repo = repoEnd === -1 ? rest : rest.slice(0, repoEnd);
  if (!REPO.test(repo) || !isNameSegment(repo)) {
    return malformed(`${JSON.stringify(repo)} is not a GitHub repository`);
  }

  let remainder = repoEnd === -1 ? '' : rest.slice(repoEnd);
  let ref: string | undefined;
  if (remainder.startsWith('@')) {
    const refEnd = remainder.indexOf('/');
    ref = refEnd === -1 ? remainder.slice(1) : remainder.slice(1, refEnd);
    if (!REF.test(ref)) return malformed(`${JSON.stringify(ref)} is not a ref`);
    remainder = refEnd === -1 ? '' : remainder.slice(refEnd);
  }

  const path = remainder.slice(1);
  if (remainder !== '' && !path.split('/').every(isNameSegment)) {
    return malformed(`${JSON.stringify(path)} is not a directory path`);
  }

  return { ok: true, location: { owner, repo, ref, path } };
};

/** The complete resolved location, in the syntax `parseGitHubLocation` reads. */
export const formatGitHubLocation = ({ owner, repo, sha, path }: ResolvedGitHubLocation): string =>
  `${SCHEME}${owner}/${repo}@${sha}${path === '' ? '' : `/${path}`}`;
