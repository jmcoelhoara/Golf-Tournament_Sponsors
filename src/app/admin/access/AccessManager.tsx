"use client";

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { checkedMutation } from '@/lib/event-media';
import type { StaffEvent } from '@/lib/staff';
import MutationForm from '../MutationForm';

type Account = { user_id: string; email: string; role: string };
type Grant = { user_id: string; revoked_at: string | null };

export default function AccessManager({ events }: { events: StaffEvent[] }) {
  const [eventId, setEventId] = useState('');
  const [rows, setRows] = useState<{ source: StaffEvent; accounts: Account[]; grants: Grant[] } | null>(null);
  const [error, setError] = useState('');
  const event = events.find(e => e.id === eventId);

  useEffect(() => {
    if (!event) return;
    let cancelled = false;
    const db = createClient();
    Promise.all([
      db.rpc('list_staff_accounts', { p_organization_id: event.organization_id }),
      db.from('event_staff_access').select('user_id,revoked_at').eq('event_id', event.id),
    ]).then(([accounts, grants]) => {
      if (cancelled) return;
      if (accounts.error || grants.error) {
        setError(accounts.error?.message ?? grants.error?.message ?? 'Unable to load access');
        return;
      }
      setError('');
      setRows({ source: event, accounts: (accounts.data ?? []) as Account[], grants: (grants.data ?? []) as Grant[] });
    }).catch(e => {
      if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load access');
    });
    return () => { cancelled = true; };
  }, [event]);

  return <section className="card">
    <label className="stack">Event to manage
      <select className="input" value={eventId} onChange={e => {
        setEventId(e.target.value);
        setRows(null);
        setError('');
      }}>
        <option value="">Select event</option>
        {events.map(e => <option key={e.id} value={e.id}>{e.name}{e.archived_at ? ' (archived)' : ''}</option>)}
      </select>
    </label>
    <p className="small muted">Only existing organization staff accounts can be enabled. Organization ownership does not grant event access.</p>
    {error && <p role="alert" className="result error">{error}</p>}
    {event && rows?.source !== event && !error && <p role="status">Loading staff accounts…</p>}
    {event && rows?.accounts.map(account => <AccessRow
      key={`${event.id}:${account.user_id}`}
      eventId={event.id}
      account={account}
      snapshot={rows}
      disabled={rows.source !== event || !!error}
      initialEnabled={rows.grants.some(g => g.user_id === account.user_id && g.revoked_at === null)}
    />)}
    {rows?.accounts.length === 0 && <p>No existing staff accounts in this organization.</p>}
  </section>;
}

function AccessRow({ eventId, account, initialEnabled, disabled, snapshot }: {
  eventId: string;
  account: Account;
  initialEnabled: boolean;
  disabled: boolean;
  snapshot: object;
}) {
  const [draft, setDraft] = useState({
    snapshot, authority: initialEnabled, enabled: initialEnabled, dirty: false, conflict: false,
  });

  // Reconcile before committing the refreshed row, without remounting its pending form.
  // Dirty drafts require an explicit decision even if they match the new authority.
  if (draft.snapshot !== snapshot) {
    setDraft({
      snapshot,
      authority: initialEnabled,
      enabled: draft.dirty ? draft.enabled : initialEnabled,
      dirty: draft.dirty,
      conflict: draft.conflict || (draft.dirty && draft.authority !== initialEnabled),
    });
  }

  return <div className="access-row">
    <p>{account.email}</p>
    <p className="small muted">{account.role}</p>
    {draft.conflict && <div role="alert" className="result error">
      <p>Access changed on the server while you had unsaved edits. Latest access is {initialEnabled ? 'enabled' : 'revoked'}. Your local selection may be out of date. Saving is blocked until you review the latest access.</p>
      <button type="button" className="btn small secondary" disabled={disabled} onClick={() => setDraft({
        snapshot, authority: initialEnabled, enabled: initialEnabled, dirty: false, conflict: false,
      })}>Use latest access</button>
    </div>}
    <MutationForm submit="Save access" disabled={disabled || draft.conflict} run={async () => {
      if (disabled) throw new Error('Wait for access to refresh before saving.');
      if (draft.conflict) throw new Error('Review the changed access before saving.');
      checkedMutation(await createClient().rpc('set_event_staff_access', {
        p_event_id: eventId, p_user_id: account.user_id, p_enabled: draft.enabled,
      }));
      setDraft(current => current.conflict ? current : { ...current, dirty: false });
    }}>
      <label><input type="checkbox" checked={draft.enabled} onChange={e => {
        const enabled = e.target.checked;
        setDraft({ ...draft, enabled, dirty: enabled !== initialEnabled });
      }}/>Enabled access for {account.email}</label>
    </MutationForm>
  </div>;
}
