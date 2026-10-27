import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
import PrintSheet from './PrintSheet';
const props={eventName:'Charity Open',contestName:"Men's Long Drive",holeNumber:7,tees:'Gold',yardage:420,qr:'data:image/png;base64,qr',publicUrl:'https://golf.example/c/old-token',logo:{bucket:'event-media',path:'org/event/logo.png',alt_text:'Current tournament logo'}};
it('prints a branded contest sheet with current logo, QR target, event, contest and hole after images load',()=>{
 const print=vi.spyOn(window,'print').mockImplementation(()=>{});
 render(<PrintSheet {...props}/>);
 expect(screen.getByRole('heading',{name:'Charity Open'})).toBeTruthy();expect(screen.getByRole('heading',{name:"Men's Long Drive"})).toBeTruthy();expect(screen.getByText('Hole 7')).toBeTruthy();expect(screen.getByText(/420 yards/)).toBeTruthy();expect(screen.getByText(/Gold tees/)).toBeTruthy();
 expect(screen.getByRole('link',{name:'Open player page'}).getAttribute('href')).toBe(props.publicUrl);
 const button=screen.getByRole('button',{name:'Print contest sheet'}) as HTMLButtonElement;
 expect(button.disabled).toBe(true);fireEvent.load(screen.getByAltText('Current tournament logo'));expect(button.disabled).toBe(true);fireEvent.load(screen.getByAltText('Contest QR code'));fireEvent.click(button);expect(print).toHaveBeenCalledOnce();
});
it('blocks printing a broken QR and shows an actionable image error',()=>{render(<PrintSheet {...props} logo={null}/>);fireEvent.error(screen.getByAltText('Contest QR code'));expect(screen.getByRole('alert').textContent).toMatch(/QR.*reload/i);expect((screen.getByRole('button',{name:'Print contest sheet'}) as HTMLButtonElement).disabled).toBe(true)});
