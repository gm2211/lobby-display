import { test, expect } from '../../helpers/api-test';

test.describe('Events API', () => {
  test('GET /api/events returns an array', async ({ api }) => {
    const res = await api.get('/api/events');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /api/events creates an event with details array', async ({ data }) => {
    const event = await data.createEvent({
      title: '[e2e-test] POST Event',
      subtitle: 'Test subtitle',
      details: ['Detail line 1', 'Detail line 2'],
      sortOrder: 9999,
    });
    expect(event).toHaveProperty('id');
    expect(typeof event.id).toBe('number');
    expect(event.title).toBe('[e2e-test] POST Event');
    expect(event.subtitle).toBe('Test subtitle');
    expect(Array.isArray(event.details)).toBe(true);
    expect(event.details).toEqual(['Detail line 1', 'Detail line 2']);
  });

  test('PUT /api/events/:id updates fields and preserves details array', async ({ api, data }) => {
    const event = await data.createEvent({
      title: '[e2e-test] PUT Event',
      details: ['Original detail'],
    });

    const res = await api.put(`/api/events/${event.id}`, {
      title: '[e2e-test] PUT Event Updated',
      details: ['Updated detail 1', 'Updated detail 2'],
    });
    expect(res.ok()).toBe(true);
    const updated = await res.json();
    expect(updated.title).toBe('[e2e-test] PUT Event Updated');
    expect(updated.id).toBe(event.id);
    expect(Array.isArray(updated.details)).toBe(true);
    expect(updated.details).toEqual(['Updated detail 1', 'Updated detail 2']);
  });

  test('DELETE /api/events/:id marks for deletion', async ({ api, data }) => {
    const event = await data.createEvent({ title: '[e2e-test] DELETE Event' });
    const res = await api.delete(`/api/events/${event.id}`);
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Verify the event is marked for deletion
    const listRes = await api.get('/api/events');
    const events = await listRes.json();
    const found = events.find((e: { id: number }) => e.id === event.id);
    expect(found).toBeTruthy();
    expect(found.markedForDeletion).toBe(true);
  });
});
