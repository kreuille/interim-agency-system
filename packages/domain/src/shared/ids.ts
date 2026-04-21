export type Uuid = string & { readonly __brand: 'Uuid' };
export type AgencyId = string & { readonly __brand: 'AgencyId' };
export type StaffId = string & { readonly __brand: 'StaffId' };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function asUuid(value: string): Uuid {
  if (!UUID_REGEX.test(value)) {
    throw new Error(`Invalid UUID: ${value}`);
  }
  return value as Uuid;
}

export function asAgencyId(value: string): AgencyId {
  if (value.length === 0) {
    throw new Error('AgencyId cannot be empty');
  }
  return value as AgencyId;
}

export function asStaffId(value: string): StaffId {
  if (value.length === 0) {
    throw new Error('StaffId cannot be empty');
  }
  return value as StaffId;
}
