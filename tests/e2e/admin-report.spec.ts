import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const dashboard = {
  totals: {
    activeMembers: 42,
    invitedMembers: 7,
    activeSessions: 3,
    upcomingEvents: 2
  },
  upcoming: [
    {
      id: 'event-1',
      name: 'District Assembly',
      startTime: new Date(Date.now() + 3600_000).toISOString(),
      endTime: new Date(Date.now() + 7200_000).toISOString(),
      allowWalkIns: true,
      requireRsvp: false,
      hostClubId: 'club-1',
      status: 'UPCOMING'
    }
  ],
  pendingInvites: [
    { id: 'invite-1', email: 'guest@example.com', displayName: 'Guest User' }
  ]
};

const events = [
  {
    id: 'event-1',
    name: 'District Assembly',
    startTime: new Date(Date.now() + 3600_000).toISOString(),
    endTime: new Date(Date.now() + 7200_000).toISOString(),
    allowWalkIns: true,
    requireRsvp: false,
    hostClubId: 'club-1',
    status: 'UPCOMING'
  }
];

const report = {
  event: {
    id: 'event-1',
    name: 'District Assembly',
    status: 'ACTIVE',
    mode: 'NO_RSVP',
    allowWalkIns: true,
    hostClubs: [{ id: 'club-1', name: 'Colombo Club' }]
  },
  timeline: {
    scheduledStart: new Date().toISOString(),
    scheduledEnd: new Date(Date.now() + 7200_000).toISOString(),
    actualStart: new Date().toISOString(),
    actualEnd: new Date(Date.now() + 5400_000).toISOString(),
    scheduledDurationMinutes: 120,
    actualDurationMinutes: 90,
    overrunMinutes: -30
  },
  totals: {
    totalAttendees: 25,
    guestCount: 5,
    manualCount: 2,
    stillCheckedInCount: 1
  },
  categories: [
    { category: 'INVITED_GUESTS', label: 'Invited Guests', attendeeCount: 5, guestCount: 5 },
    { category: 'CLUB_MEMBERS', label: 'Club Members', attendeeCount: 20, guestCount: 0 }
  ],
  attendees: [
    {
      id: 'attendee-1',
      name: 'Alex Lion',
      categoryLabel: 'Invited Guests',
      isGuest: true,
      checkIn: new Date().toISOString(),
      checkOut: new Date(Date.now() + 3600_000).toISOString(),
      totalMinutes: 60
    }
  ]
};

test.describe('admin reporting', () => {
  test('renders reporting summary and passes a11y checks', async ({ page }) => {
    await page.route('**/api/admin/dashboard', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(dashboard)
      });
    });

    await page.route('**/api/admin/events', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(events)
      });
    });

    await page.route('**/api/admin/events/event-1/report', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(report)
      });
    });

    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: 'Event report' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Invited Guests', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Club Members', exact: true }).first()).toBeVisible();

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScanResults.violations).toEqual([]);
  });
});
