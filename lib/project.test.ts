import { describe, expect, it } from 'vitest';
import { PROJECT_DESCRIPTION, PROJECT_NAME, SEARCH_PLACEHOLDER } from './project';

describe('project metadata', () => {
  it('provides shared public product copy', () => {
    expect(PROJECT_NAME).toBe('On-Core');
    expect(PROJECT_DESCRIPTION).toContain('on-device search');
    expect(SEARCH_PLACEHOLDER).toContain('Ask');
  });
});
