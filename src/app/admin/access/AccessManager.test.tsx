import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const { rpc, from, refresh } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), refresh: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ rpc, from }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
import AccessManager from './AccessManager';

const event = {
 id: 'e1', organization_id: 'org', name: 'Charity Open', course_id: null,
 course_name: null, event_date: null, status: 'draft', logo_image_id: null, archived_at: null,
};

// Only the Supabase transport and router refresh are mocked. Rows and MutationForm are real.
beforeEach(() => {
 refresh.mockReset();
 rpc.mockReset();
 rpc.mockImplementation(name => Promise.resolve({
  data: name === 'list_staff_accounts'
   ? [{user_id: 'staff1', email: 'staff1@test', role: 'staff'}] : {ok: true},
  error: null,
 }));
 const q = {select: () => q, eq: () => Promise.resolve({data: [], error: null})};
 from.mockReturnValue(q);
});

it('lists existing staff for the selected event organization and enables access with exact RPC parameters', async () => {
 render(<AccessManager events={[event]}/>);
 fireEvent.change(screen.getByLabelText('Event to manage'), {target: {value: 'e1'}});
 expect(await screen.findByText('staff1@test')).toBeTruthy();
 expect(rpc).toHaveBeenCalledWith('list_staff_accounts', {p_organization_id: 'org'});
 fireEvent.click(screen.getByRole('checkbox', {name: 'Enabled access for staff1@test'}));
 fireEvent.click(screen.getByRole('button', {name: 'Save access'}));
 await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_event_staff_access', {
  p_event_id: 'e1', p_user_id: 'staff1', p_enabled: true,
 }));
});

it('revokes an active event grant with explicit false, without deleting the staff account', async () => {
 const q = {select: () => q, eq: () => Promise.resolve({
  data: [{user_id: 'staff1', revoked_at: null}], error: null,
 })};
 from.mockReturnValue(q);
 render(<AccessManager events={[event]}/>);
 fireEvent.change(screen.getByLabelText('Event to manage'), {target: {value: 'e1'}});
 const checkbox = await screen.findByRole('checkbox', {name: 'Enabled access for staff1@test'});
 expect((checkbox as HTMLInputElement).checked).toBe(true);
 fireEvent.click(checkbox);
 fireEvent.click(screen.getByRole('button', {name: 'Save access'}));
 await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_event_staff_access', {
  p_event_id: 'e1', p_user_id: 'staff1', p_enabled: false,
 }));
 expect(from).toHaveBeenCalledWith('event_staff_access');
});
it.each([true, false])('reconciles a clean same-event row when authoritative enabled=%s changes', async (initialEnabled) => {
 let enabled = initialEnabled;
 const q = {
  select: () => q,
  eq: () => Promise.resolve({data: [{user_id: 'staff1', revoked_at: enabled ? null : '2026-10-26'}], error: null}),
 };
 from.mockReturnValue(q);
 const {rerender} = render(<AccessManager events={[event]}/>);
 fireEvent.change(screen.getByLabelText('Event to manage'), {target: {value: 'e1'}});
 const checkbox = await screen.findByRole('checkbox', {name: 'Enabled access for staff1@test'});
 expect((checkbox as HTMLInputElement).checked).toBe(initialEnabled);
 enabled = !initialEnabled;
 rerender(<AccessManager events={[{...event}]}/>);
 await waitFor(() => expect(rpc.mock.calls.filter(([name]) => name === 'list_staff_accounts')).toHaveLength(2));
 await waitFor(() => expect((checkbox as HTMLInputElement).checked).toBe(!initialEnabled));
 fireEvent.click(screen.getByRole('button', {name: 'Save access'}));
 await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_event_staff_access', {
  p_event_id: 'e1', p_user_id: 'staff1', p_enabled: !initialEnabled,
 }));
});
it.each([true, false])('blocks an unsaved draft conflict when authoritative enabled=%s changes', async (initialEnabled) => {
 let enabled = initialEnabled;
 const q = {select: () => q, eq: () => Promise.resolve({
  data: [{user_id: 'staff1', revoked_at: enabled ? null : '2026-10-26'}], error: null,
 })};
 from.mockReturnValue(q);
 const {rerender} = render(<AccessManager events={[event]}/>);
 fireEvent.change(screen.getByLabelText('Event to manage'), {target: {value: 'e1'}});
 const checkbox = await screen.findByRole('checkbox', {name: 'Enabled access for staff1@test'});
 fireEvent.click(checkbox);
 enabled = !initialEnabled;
 rerender(<AccessManager events={[{...event}]}/>);
 const alert = await screen.findByRole('alert');
 expect(alert.textContent).toContain('Access changed on the server');
 expect(alert.textContent).toContain(enabled ? 'enabled' : 'revoked');
 const save = screen.getByRole('button', {name: 'Save access'});
 expect((save.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
 fireEvent.click(save);
 expect(rpc.mock.calls.filter(([name]) => name === 'set_event_staff_access')).toHaveLength(0);
 fireEvent.click(screen.getByRole('button', {name: 'Use latest access'}));
 expect(screen.queryByRole('alert')).toBeNull();
 expect((checkbox as HTMLInputElement).checked).toBe(enabled);
 fireEvent.click(save);
 await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_event_staff_access', {
  p_event_id: 'e1', p_user_id: 'staff1', p_enabled: enabled,
 }));
});
it('blocks stale saves during a refetch and after a failed read, then recovers on fresh authority', async () => {
 const {rerender} = render(<AccessManager events={[event]}/>);
 fireEvent.change(screen.getByLabelText('Event to manage'), {target: {value: 'e1'}});
 const checkbox = await screen.findByRole('checkbox', {name: 'Enabled access for staff1@test'});
 let finishRead!: (value: unknown) => void;
 const q = {select: () => q, eq: () => new Promise(resolve => { finishRead = resolve; })};
 from.mockReturnValue(q);
 rerender(<AccessManager events={[{...event}]}/>);
 const save = screen.getByRole('button', {name: 'Save access'});
 expect((save.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
 fireEvent.click(save);
 expect(rpc.mock.calls.filter(([name]) => name === 'set_event_staff_access')).toHaveLength(0);
 await act(async () => finishRead({data: null, error: {message: 'Access refresh failed'}}));
 expect((await screen.findByRole('alert')).textContent).toBe('Access refresh failed');
 expect((save.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
 fireEvent.click(save);
 expect(rpc.mock.calls.filter(([name]) => name === 'set_event_staff_access')).toHaveLength(0);
 rerender(<AccessManager events={[{...event}]}/>);
 await act(async () => finishRead({data: [{user_id: 'staff1', revoked_at: null}], error: null}));
 await waitFor(() => expect((save.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(false));
 expect(screen.queryByRole('alert')).toBeNull();
 expect((checkbox as HTMLInputElement).checked).toBe(true);
 fireEvent.click(save);
 await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_event_staff_access', {
  p_event_id: 'e1', p_user_id: 'staff1', p_enabled: true,
 }));
});
it.each([
 {initialEnabled: true, dirty: false}, {initialEnabled: false, dirty: false},
 {initialEnabled: true, dirty: true}, {initialEnabled: false, dirty: true},
])('reconciles enabled=$initialEnabled dirty=$dirty after another account saves', async ({initialEnabled, dirty}) => {
 let enabled = initialEnabled;
 rpc.mockImplementation(name => Promise.resolve({data: name === 'list_staff_accounts' ? [
  {user_id: 'staff1', email: 'staff1@test', role: 'staff'},
  {user_id: 'staff2', email: 'staff2@test', role: 'staff'},
 ] : {ok: true}, error: null}));
 const q = {select: () => q, eq: () => Promise.resolve({
  data: [{user_id: 'staff1', revoked_at: enabled ? null : '2026-10-26'}], error: null,
 })};
 from.mockReturnValue(q);
 const {rerender} = render(<AccessManager events={[event]}/>);
 refresh.mockImplementation(() => rerender(<AccessManager events={[{...event}]}/>));
 fireEvent.change(screen.getByLabelText('Event to manage'), {target: {value: 'e1'}});
 const first = await screen.findByRole('checkbox', {name: 'Enabled access for staff1@test'});
 if (dirty) fireEvent.click(first);
 enabled = !initialEnabled;
 const second = screen.getByRole('checkbox', {name: 'Enabled access for staff2@test'});
 fireEvent.click(second);
 fireEvent.click(within(second.closest('form')!).getByRole('button', {name: 'Save access'}));
 await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
 expect(rpc).toHaveBeenCalledWith('set_event_staff_access', {p_event_id: 'e1', p_user_id: 'staff2', p_enabled: true});
 const firstForm = within(first.closest('form')!);
 if (dirty) {
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Access changed on the server'));
  expect((firstForm.getByRole('button', {name: 'Save access'}).closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', {name: 'Use latest access'}));
 } else {
  await waitFor(() => expect((first as HTMLInputElement).checked).toBe(enabled));
 }
 expect((first as HTMLInputElement).checked).toBe(enabled);
 fireEvent.click(firstForm.getByRole('button', {name: 'Save access'}));
 await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_event_staff_access', {p_event_id: 'e1', p_user_id: 'staff1', p_enabled: enabled}));
});
it('reconciles a completed save against the next read even when authority equals its pre-save value', async () => {
 const {rerender} = render(<AccessManager events={[event]}/>);
 refresh.mockImplementation(() => rerender(<AccessManager events={[{...event}]}/>));
 fireEvent.change(screen.getByLabelText('Event to manage'), {target: {value: 'e1'}});
 const checkbox = await screen.findByRole('checkbox', {name: 'Enabled access for staff1@test'});
 fireEvent.click(checkbox);
 fireEvent.click(screen.getByRole('button', {name: 'Save access'}));
 await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
 // The next authoritative read is revoked again (e.g. an intervening external revoke).
 await waitFor(() => expect((checkbox as HTMLInputElement).checked).toBe(false));
 fireEvent.click(screen.getByRole('button', {name: 'Save access'}));
 await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_event_staff_access', {
  p_event_id: 'e1', p_user_id: 'staff1', p_enabled: false,
 }));
});
it('preserves an unsaved draft when a refresh reports unchanged authority', async () => {
 const {rerender} = render(<AccessManager events={[event]}/>);
 fireEvent.change(screen.getByLabelText('Event to manage'), {target: {value: 'e1'}});
 const checkbox = await screen.findByRole('checkbox', {name: 'Enabled access for staff1@test'});
 fireEvent.click(checkbox);
 rerender(<AccessManager events={[{...event}]}/>);
 await waitFor(() => expect(rpc.mock.calls.filter(([name]) => name === 'list_staff_accounts')).toHaveLength(2));
 await waitFor(() => expect((checkbox.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(false));
 expect((checkbox as HTMLInputElement).checked).toBe(true);
 expect(screen.queryByRole('alert')).toBeNull();
});
it.each([false, true])('keeps a pending save mounted when refreshed authority changes=%s', async changed => {
 let enabled = false;
 let finishSave!: (value: unknown) => void;
 rpc.mockImplementation(name => name === 'list_staff_accounts'
  ? Promise.resolve({data: [{user_id: 'staff1', email: 'staff1@test', role: 'staff'}], error: null})
  : new Promise(resolve => { finishSave = resolve; }));
 const q = {select: () => q, eq: () => Promise.resolve({
  data: [{user_id: 'staff1', revoked_at: enabled ? null : '2026-10-26'}], error: null,
 })};
 from.mockReturnValue(q);
 const {rerender} = render(<AccessManager events={[event]}/>);
 fireEvent.change(screen.getByLabelText('Event to manage'), {target: {value: 'e1'}});
 const checkbox = await screen.findByRole('checkbox', {name: 'Enabled access for staff1@test'});
 fireEvent.click(checkbox);
 fireEvent.click(screen.getByRole('button', {name: 'Save access'}));
 expect(screen.getByRole('button', {name: 'Saving…'})).toBeTruthy();
 enabled = changed;
 rerender(<AccessManager events={[{...event}]}/>);
 await waitFor(() => expect(rpc.mock.calls.filter(([name]) => name === 'list_staff_accounts')).toHaveLength(2));
 await waitFor(() => expect(screen.queryByText('Loading staff accounts…')).toBeNull());
 const pending = screen.getByRole('button', {name: 'Saving…'});
 expect((pending.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
 fireEvent.click(pending);
 expect(rpc.mock.calls.filter(([name]) => name === 'set_event_staff_access')).toHaveLength(1);
 await act(async () => finishSave({data: {ok: true}, error: null}));
 const save = screen.getByRole('button', {name: 'Save access'});
 if (changed) {
  expect(screen.getByRole('alert').textContent).toContain('Access changed on the server');
  expect((save.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);
 } else {
  expect(screen.queryByRole('alert')).toBeNull();
 }
});
it('surfaces permission account lookup errors rather than showing fabricated staff', async () => {
 rpc.mockResolvedValue({data: null, error: {message: 'not_allowed'}});
 render(<AccessManager events={[event]}/>);
 fireEvent.change(screen.getByLabelText('Event to manage'), {target: {value: 'e1'}});
 expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'not_allowed');
 expect(screen.queryByRole('button', {name: 'Save access'})).toBeNull();
});
