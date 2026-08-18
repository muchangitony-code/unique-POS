'use strict';

const BRAND = Object.freeze({
  legalName: 'Uniques Solar & General Supplies Limited',
  tagline: 'Solar Energy & General Supplies',
  website: 'https://uniquesolarltd.co.ke',
  address: 'Kamakis Corner Square, Ruiru, Kenya',
  phone: '0733 573 089',
  colors: Object.freeze({
    ink: '#14284A', ink2: '#1E3F73', orange: '#EF8A17', orangeDeep: '#D9740A',
    orangeSoft: '#FCEBD6', paper: '#EEF1F4', line: '#C9D2DE', lineSoft: '#E4E9F0',
    muted: '#5C6B85', danger: '#B3402A', white: '#FFFFFF'
  }),
  logo: '/assets/branding/logo.svg',
  thermalLogo: '/assets/branding/logo-monochrome.svg'
});

module.exports = BRAND;
