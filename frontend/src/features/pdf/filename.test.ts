import { describe, expect, it } from 'vitest';
import { itineraryFilename } from './filename';

describe('itineraryFilename', () => {
  it('slugifies the Trip name', () => {
    expect(itineraryFilename('Japan Spring')).toBe('japan-spring-itinerary.pdf');
    expect(itineraryFilename('  Café & Côte d’Azur 2027! ')).toBe(
      'cafe-cote-d-azur-2027-itinerary.pdf',
    );
    expect(itineraryFilename('東京')).toBe('trip-itinerary.pdf');
  });
});
