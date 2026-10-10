import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessionSignOutControl } from './settings';

describe('current session sign out', () => {
  it('hides the sign-out button on this device', () => {
    render(<SessionSignOutControl isCurrent device="Chrome on macOS" />);
    expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull();
    expect(screen.getByText('Sign out here from the account menu.')).toBeTruthy();
  });

  it('offers sign out on another device', () => {
    render(<SessionSignOutControl isCurrent={false} device="Firefox on Windows" />);
    expect(screen.getByRole('button', { name: 'Sign out Firefox on Windows' })).toBeTruthy();
  });
});
