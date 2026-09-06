export type NavNode = {
  key: string;
  label: string;
  description?: string;
  icon?: string;
  route?: string;
  isGroup?: boolean;
  children?: NavNode[];
  gemKey?: string;
  featureKey?: string;
  locked?: boolean;
};

export type HubNavState = {
  stack: NavNode[];
  currentNodes: NavNode[];
  contentRoute: string | null;
  isContentMode: boolean;
  breadcrumbTrail: NavNode[];
  navKey: string;
};
