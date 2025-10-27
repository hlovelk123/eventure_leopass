import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const dashboardResponse = {
  today: [
    {
      id: 'event-1',
      name: 'Leadership Workshop',
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      status: 'ACTIVE',
      venue: 'Colombo Hall',
      allowWalkIns: true,
      requireRsvp: false
    }
  ],
  upcoming: [
    {
      id: 'event-2',
      name: 'Community Outreach',
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
      status: 'UPCOMING',
      venue: 'Galle Face Green',
      allowWalkIns: false,
      requireRsvp: true
    }
  ],
  history: [
    {
      eventId: 'event-0',
      eventName: 'Orientation',
      checkInTs: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      checkOutTs: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
      method: 'STEWARD',
      reportCategory: 'CLUB_MEMBERS'
    }
  ],
  notifications: [
    {
      id: 'notif-1',
      title: 'Event reminder',
      body: 'Remember to arrive 15 minutes early.',
      createdAt: new Date().toISOString(),
      readAt: null,
      category: 'EVENT'
    }
  ]
};

const notificationPreferences = {
  pushEnabled: false,
  emailEnabled: true,
  inAppEnabled: true
};

test.describe('member dashboard', () => {
  test('renders dashboard data and passes basic a11y checks', async ({ page }) => {
    await page.route('**/api/member/dashboard', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(dashboardResponse)
      });
    });
    await page.route('**/api/notifications/preferences', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(notificationPreferences)
      });
    });

    await page.goto('/member');

    await expect(page.getByRole('heading', { name: 'Welcome to Leo Pass' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show QR' })).toBeVisible();
    await expect(page.getByText('Event reminder')).toBeVisible();

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
