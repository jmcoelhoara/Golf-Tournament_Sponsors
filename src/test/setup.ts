import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
const items = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {getItem: (key: string) => items.get(key) ?? null, setItem: (key: string,value: string) => items.set(key,value), removeItem: (key: string) => items.delete(key), clear: () => items.clear()}, configurable: true });
afterEach(() => cleanup());
