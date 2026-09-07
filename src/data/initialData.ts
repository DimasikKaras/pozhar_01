import { Facility, Inspector, Equipment, Inspection } from '../types';

export const INITIAL_FACILITIES: Facility[] = [];
export const INITIAL_INSPECTORS: Inspector[] = [
  {
    id: 1,
    full_name: 'Быков Дмитрий Алексеевич',
    rank: 'Полковник внутренней службы',
    phone: '+7 (999) 112-01-01',
    email: 'dbykov338@gmail.com',
    role: 'Администратор',
    two_factor_enabled: true,
    two_factor_method: 'totp',
    two_factor_secret: 'MZXW6YTBOI======',
    backup_codes: ['1122-3344', '5566-7788', '9900-1122', '3344-5566']
  },
  {
    id: 2,
    full_name: 'Быков Дмитрий Алексеевич',
    rank: 'Майор внутренней службы',
    phone: '+7 (950) 063-45-97',
    email: 'dbykov141@gmail.com',
    role: 'Администратор',
    two_factor_enabled: true,
    two_factor_method: 'totp',
    two_factor_secret: 'NBSWY3DPEHPK3PXP',
    backup_codes: ['2233-4455', '6677-8899', '1122-9900', '4455-6677']
  }
];
export const INITIAL_EQUIPMENT: Equipment[] = [];
export const INITIAL_INSPECTIONS: Inspection[] = [];
