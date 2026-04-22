import { describe, expect, it } from 'vitest';
import { maskPhone } from './phone-mask.js';

describe('maskPhone', () => {
  it('CH 11 chiffres → préfixe + 2 derniers visibles', () => {
    expect(maskPhone('+41791234567')).toBe('+4179*****67');
  });

  it('FR 11 chiffres', () => {
    expect(maskPhone('+33612345678')).toBe('+3361*****78');
  });

  it('numéro court → masqué entier sans crash', () => {
    expect(maskPhone('+41')).toBe('+41');
  });

  it('absence préfixe → fully masked', () => {
    expect(maskPhone('0791234567')).toBe('****');
  });
});
