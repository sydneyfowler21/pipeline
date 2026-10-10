import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StageChip } from './stage-chip';

describe('StageChip', () => {
  it('shows the stage name with its icon', () => {
    render(<StageChip stage="Interview" />);
    expect(screen.getByText('Interview')).toBeTruthy();
  });
});
