import { existsSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signInWithPassword: vi.fn() } }) }));
import StaffSignIn from './StaffSignIn';
import { COURSE_BRANDS, defaultCourseBrand, findCourseBrand } from '@/lib/course-brand';

it('shows the course logo, course map and the real sign-in form for a branded course', () => {
  const brand = findCourseBrand('westwood-plateau')!;
  const { container } = render(<StaffSignIn brand={brand} />);
  expect(screen.getByRole('heading', { name: 'Staff sign in' })).toBeTruthy();
  expect(screen.getByAltText(brand.logo.alt)).toBeTruthy();
  expect(screen.getByAltText(brand.map.alt)).toBeTruthy();
  expect(screen.getByRole('complementary', { name: 'Sky Course course map' })).toBeTruthy();
  expect(container.querySelector('input[type="email"]')).toBeTruthy();
  expect(container.querySelector('input[type="password"]')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
});

it('falls back to an unbranded sign-in card', () => {
  render(<StaffSignIn />);
  expect(screen.getByRole('heading', { name: 'Staff sign in' })).toBeTruthy();
  expect(screen.queryByRole('complementary')).toBeNull();
});

it('only resolves registered course slugs', () => {
  expect(findCourseBrand('nope')).toBeUndefined();
  expect(findCourseBrand('constructor')).toBeUndefined();
  expect(defaultCourseBrand()?.slug).toBe('westwood-plateau');
  for (const b of Object.values(COURSE_BRANDS)) {
    expect(b.logo.src.startsWith(`/courses/${b.slug}/`)).toBe(true);
    expect(b.map.src.startsWith(`/courses/${b.slug}/`)).toBe(true);
    expect(existsSync(`public${b.logo.src}`) && existsSync(`public${b.map.src}`)).toBe(true);
  }
});
