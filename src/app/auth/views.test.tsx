import {render,screen} from '@testing-library/react';import {beforeEach,expect,it,vi} from 'vitest';
const {client}=vi.hoisted(()=>({client:{auth:{getUser:vi.fn(),verifyOtp:vi.fn()}}}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>client}));vi.mock('next/navigation',()=>({redirect:(p:string)=>{throw new Error(`redirect:${p}`)}}));
import {InvitationContent,PasswordContent} from './views';
beforeEach(()=>{vi.clearAllMocks();client.auth.getUser.mockResolvedValue({data:{user:{id:'fake'}},error:null})});
it('GET landing does not verify or consume a valid token',async()=>{render(await InvitationContent({searchParams:Promise.resolve({token_hash:'a'.repeat(64),type:'invite'})}));expect(screen.getByRole('button',{name:'Accept invitation'})).toBeTruthy();expect(client.auth.verifyOtp).not.toHaveBeenCalled();expect(client.auth.getUser).not.toHaveBeenCalled()});
it.each([{token_hash:'a'.repeat(64),type:'recovery'},{token_hash:'a'.repeat(64),type:'invite',next:'https://evil.test'},{token_hash:['a'.repeat(64),'b'.repeat(64)],type:'invite'},{}])('invalid landing shows help without consuming Auth',async(params)=>{render(await InvitationContent({searchParams:Promise.resolve(params)}));expect(screen.queryByRole('button',{name:'Accept invitation'})).toBeNull();expect(client.auth.verifyOtp).not.toHaveBeenCalled()});
it('signed-out password page redirects before showing form',async()=>{client.auth.getUser.mockResolvedValue({data:{user:null},error:null});await expect(PasswordContent()).rejects.toThrow('redirect:/login')});
it('verified session can view password setup',async()=>{render(await PasswordContent());expect(screen.getByLabelText('New password')).toBeTruthy();expect(client.auth.getUser).toHaveBeenCalledTimes(1)});
