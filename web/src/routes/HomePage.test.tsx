import { render, screen } from '@testing-library/react';

import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('renders hero message', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { name: 'Leo Pass Platform' })).toBeVisible();
  });
});
