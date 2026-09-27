import { describe, expect, it } from 'vitest';
import { parseGitHubRepository } from './github-url';

describe('parseGitHubRepository', () => {
  it.each(['https://github.com/facebook/react', 'github.com/facebook/react/', 'facebook/react.git'])('normalizes %s', (input) => {
    expect(parseGitHubRepository(input)).toEqual({ owner: 'facebook', repo: 'react' });
  });
  it.each(['facebook', 'https://gitlab.com/a/b', 'https://github.com/a/b/issues', 'a/../b', 'https://github.com.evil.org/a/b'])('rejects %s', (input) => {
    expect(() => parseGitHubRepository(input)).toThrow();
  });
});
