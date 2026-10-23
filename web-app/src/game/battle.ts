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

export interface BattleCharacter {
  file: string;
  name: string;
  skills: [number, number, number];
  defaultAction: number;
  resist: [number, number, number];
  survive: number;
  object: string;
  actionRates?: Array<[number, number, number, number]>;
}

export interface BattleEncounter {
  party: BattleParty;
  characters: BattleCharacter[];
}
