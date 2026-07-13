import { describe, expect, it } from 'vitest';
import { PROJECT_DESCRIPTION, PROJECT_NAME, SEARCH_PLACEHOLDER } from './project';

describe('project metadata', () => {
  it('provides the shared Milestone 1 copy', () => {
    expect(PROJECT_NAME).toBe('Local Web Memory');
    expect(PROJECT_DESCRIPTION).toContain('local-first');
    expect(SEARCH_PLACEHOLDER).toContain('Ask');
  });
});
