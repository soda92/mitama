export interface StoryScene {
  name: string;
  title: string;
  route: string;
  chapter: string;
  order: number;
  first?: string;
}

export interface StoryChapter {
  id: string;
  route: string;
  title: string;
  order: number;
  scenes: string[];
}

export interface StoryEdge {
  from: string;
  to?: string;
  fromScene: string;
  toScene?: string;
  kind: "scene" | "choice" | "battle" | "end" | "unknown";
  label: string;
  text: string;
  textEn?: string;
  pc: number;
  targetPc?: number;
  notes?: string[];
}

export interface StoryMapData {
  scenes: StoryScene[];
  chapters: StoryChapter[];
  edges: StoryEdge[];
}

const cache = new Map<string, StoryMapData>();

export async function loadStoryMap(packId: string): Promise<StoryMapData> {
  const cached = cache.get(packId);
  if (cached) return cached;
  const response = await fetch(`/api/storymap?pack=${encodeURIComponent(packId)}`);
  if (!response.ok) throw new Error(`story map: HTTP ${response.status}`);
  const data = (await response.json()) as StoryMapData;
  cache.set(packId, data);
  return data;
}
