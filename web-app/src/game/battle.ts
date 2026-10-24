export interface BattleMember {
  file: string;
  action: number;
}

export interface BattleParty {
  name: string;
  gauge: string;
  bgm: string;
  maxHp: number;
  enter: string;
  exit: string;
  members: BattleMember[];
  winText?: string;
  loseText?: string;
}

export interface SpriteFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface CharacterSprite {
  bmp: string;
  frames: SpriteFrame[];
  idle: number[];
}

export interface BattleMotionStep {
  bmp: string;
  frame: SpriteFrame;
  wait: number;
}

export interface BattleMotion {
  index: number;
  file: string;
  steps: BattleMotionStep[];
}

export interface BattleCharacter {
  file: string;
  name: string;
  skills: [number, number, number];
  defaultAction: number;
  resist: [number, number, number];
  survive: number;
  object: string;
  actionRates?: Array<[number, number, number, number]>;
  sprite?: CharacterSprite;
  motions?: BattleMotion[];
}

export interface BattleEncounter {
  party: BattleParty;
  characters: BattleCharacter[];
}
