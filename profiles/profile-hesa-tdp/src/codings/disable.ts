import type { CodingFrame } from '@databridge/platform';

export const DISABLE: CodingFrame = {
  id: 'DISABLE',
  label: 'Disability',
  hesaRef: 'DISABLE',
  multiValue: true,
  values: [
    { code: '00', label: 'No known disability' },
    { code: '08', label: 'Two or more impairments and/or disabling medical conditions' },
    { code: '51', label: 'A specific learning difficulty such as dyslexia, dyspraxia or AD(H)D' },
    { code: '53', label: 'A social/communication impairment such as Asperger syndrome/other autistic spectrum disorder' },
    { code: '54', label: 'A long standing illness or health condition' },
    { code: '55', label: 'A mental health condition, such as depression, schizophrenia or anxiety disorder' },
    { code: '56', label: 'A physical impairment or mobility issues' },
    { code: '57', label: 'Deaf or a serious hearing impairment' },
    { code: '58', label: 'Blind or a serious visual impairment uncorrected by glasses' },
    { code: '96', label: 'A disability, impairment or medical condition that is not listed above' },
    { code: '97', label: 'Information refused' },
    { code: '98', label: 'Not known' },
  ],
};
