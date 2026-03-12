export const SERVICE_STATUS = {
  OPERATIONAL: 'Operational',
  MAINTENANCE: 'Maintenance',
  OUTAGE: 'Outage',
} as const;

export type ServiceStatus = typeof SERVICE_STATUS[keyof typeof SERVICE_STATUS];

export const STATUS_COLORS: Record<ServiceStatus, string> = {
  [SERVICE_STATUS.OPERATIONAL]: '#4caf50',
  [SERVICE_STATUS.MAINTENANCE]: '#ffc107',
  [SERVICE_STATUS.OUTAGE]: '#f44336',
};

export const IMAGE_PRESETS = [
  { label: 'Yoga', url: '/images/yoga.jpg' },
  { label: 'Bagels / Brunch', url: '/images/bagels.jpg' },
  { label: 'Tequila / Drinks', url: '/images/tequila.jpg' },
] as const;
