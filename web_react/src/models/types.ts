/**
 * types.ts — TypeScript data models mirroring the family tree schema v1.0
 * Matches tree_model.py and resource_model.py from the desktop app.
 */

export type Gender = 'unknown' | 'male' | 'female' | 'other';

export interface Position {
  x: number;
  y: number;
}

export interface Link {
  label: string;
  url: string;
}

export interface TreeNode {
  id: string;
  name: string;
  birth_date: string | null;
  death_date: string | null;
  gender: Gender;
  bio: string;
  profile_image_ref: string | null; // "resources/<filename>"
  is_standalone: boolean;
  position: Position;
  links: Link[];
}

export interface TreeEdge {
  id: string;
  source: string; // TreeNode.id
  target: string; // TreeNode.id
  relationship: 'parent' | 'spouse' | 'ex_spouse' | 'sibling' | 'other' | string;
  label: string;
  /** Optional notes e.g. married date, divorce date */
  notes?: string;
}

export interface Rect {
  x: number; // % of image width
  y: number; // % of image height
  w: number;
  h: number;
}

export interface Region {
  node_id: string; // TreeNode.id or "__orphan__:Name"
  rect: Rect;
  use_as_profile: boolean;
}

export interface ResourceTags {
  persons: string[]; // node UUIDs or "__orphan__:Name"
  date: string | null;
  location: string | null;
  gps: { lat: number; lng: number } | null;
  custom_tags: string[];
}

export interface Resource {
  id: string;
  filename: string;
  original_filename: string;
  tags: ResourceTags;
  regions: Region[];
}

export interface Tree {
  tree_id: string;
  tree_name: string;
  version: string;
  created_at: string;
  updated_at: string;
  nodes: TreeNode[];
  edges: TreeEdge[];
  resources: Resource[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function newId(): string {
  return crypto.randomUUID();
}

export function makeNode(overrides: Partial<TreeNode> = {}): TreeNode {
  return {
    id: newId(),
    name: '',
    birth_date: null,
    death_date: null,
    gender: 'unknown',
    bio: '',
    profile_image_ref: null,
    is_standalone: false,
    position: { x: 0, y: 0 },
    links: [],
    ...overrides,
  };
}

export function makeEdge(overrides: Partial<TreeEdge> = {}): TreeEdge {
  return {
    id: newId(),
    source: '',
    target: '',
    relationship: 'parent',
    label: '',
    ...overrides,
  };
}

export function makeTree(overrides: Partial<Tree> = {}): Tree {
  const now = new Date().toISOString();
  return {
    tree_id: newId(),
    tree_name: 'My Family',
    version: '1.0',
    created_at: now,
    updated_at: now,
    nodes: [],
    edges: [],
    resources: [],
    ...overrides,
  };
}

export function makeResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: newId(),
    filename: '',
    original_filename: '',
    tags: {
      persons: [],
      date: null,
      location: null,
      gps: null,
      custom_tags: [],
    },
    regions: [],
    ...overrides,
  };
}

/** Derive parent label from gender, matching desktop behavior */
export function parentLabel(gender: Gender): string {
  if (gender === 'male') return 'Father of';
  if (gender === 'female') return 'Mother of';
  return 'Parent of';
}

/** Extract birth year string */
export function birthYear(node: TreeNode): string | null {
  return node.birth_date && node.birth_date.length >= 4
    ? node.birth_date.slice(0, 4)
    : null;
}

/** Extract death year string */
export function deathYear(node: TreeNode): string | null {
  return node.death_date && node.death_date.length >= 4
    ? node.death_date.slice(0, 4)
    : null;
}

/** "b. 1950" or "1950 – 2010" */
export function yearsLabel(node: TreeNode): string {
  const by = birthYear(node) ?? '?';
  if (node.death_date) {
    return `${by} – ${deathYear(node) ?? '?'}`;
  }
  return `b. ${by}`;
}

/** Gender colour scheme matching desktop app */
export const GENDER_COLORS: Record<Gender, { bg: string; border: string }> = {
  male:    { bg: '#E3F2FD', border: '#90CAF9' },
  female:  { bg: '#FCE4EC', border: '#F48FB1' },
  other:   { bg: '#F1F8E9', border: '#AED581' },
  unknown: { bg: '#FAFAFA', border: '#BDBDBD' },
};

/** Edge colour scheme matching desktop app */
export const EDGE_COLORS: Record<string, string> = {
  parent:      '#1565C0', // fallback blue (gender unknown)
  parent_male: '#1565C0', // Father of — blue
  parent_female:'#AD1457',// Mother of — red/pink
  spouse:      '#C2185B',
  ex_spouse:   '#9E9E9E',
  sibling:     '#2E7D32',
  other:       '#6D4C41',
};

/**
 * Derive edge colour from relationship + optional label.
 * Parent edges use the label to distinguish Father (blue) vs Mother (pink).
 */
export function edgeColor(relationship: string, label?: string): string {
  if (relationship === 'parent') {
    if (label === 'Father of') return EDGE_COLORS.parent_male;
    if (label === 'Mother of') return EDGE_COLORS.parent_female;
    return EDGE_COLORS.parent;
  }
  return EDGE_COLORS[relationship] ?? EDGE_COLORS.other;
}

