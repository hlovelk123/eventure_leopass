import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('renders hero message', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Leo Pass Platform' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Member QR' })).toHaveAttribute('href', '/member');
    expect(screen.getByRole('link', { name: 'Steward scanner' })).toHaveAttribute('href', '/steward/scan');
  });
});
