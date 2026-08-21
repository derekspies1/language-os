import type { InterestDomain } from "./contracts";

export type ExposureSeed = {
  key: string;
  korean: string;
  dictionaryForm: string;
  meaning: string;
  clue: string;
  domains: InterestDomain[];
};

export const KOREAN_EXPOSURE_SEEDS: ExposureSeed[] = [
  { key: "match", korean: "경기", dictionaryForm: "경기", meaning: "match; game", clue: "Often used for a competitive match or fixture.", domains: ["lck", "gaming"] },
  { key: "player", korean: "선수", dictionaryForm: "선수", meaning: "player; athlete", clue: "Used for professional players, including esports pros.", domains: ["lck", "gaming"] },
  { key: "jungle", korean: "정글", dictionaryForm: "정글", meaning: "jungle", clue: "The LoL role and map area.", domains: ["lck", "gaming"] },
  { key: "teamfight", korean: "한타", dictionaryForm: "한타", meaning: "team fight", clue: "Common Korean LoL shorthand for a full-team fight.", domains: ["lck", "gaming"] },
  { key: "win", korean: "승리", dictionaryForm: "승리", meaning: "victory; win", clue: "A noun used in match results and commentary.", domains: ["lck", "gaming"] },
  { key: "lose", korean: "패배", dictionaryForm: "패배", meaning: "defeat; loss", clue: "A noun for losing a game or match.", domains: ["lck", "gaming"] },
  { key: "attack", korean: "공격", dictionaryForm: "공격", meaning: "attack", clue: "Useful in gaming, sports, and performance commentary.", domains: ["lck", "gaming"] },
  { key: "defense", korean: "수비", dictionaryForm: "수비", meaning: "defense", clue: "Used when protecting or playing defensively.", domains: ["lck", "gaming"] },
  { key: "momentum", korean: "흐름", dictionaryForm: "흐름", meaning: "flow; momentum", clue: "Commentators use it for the direction a game is taking.", domains: ["lck", "gaming", "music"] },
  { key: "skill", korean: "실력", dictionaryForm: "실력", meaning: "skill; ability", clue: "Someone's demonstrated level of ability.", domains: ["lck", "gaming", "music", "kpop"] },
  { key: "mistake", korean: "실수", dictionaryForm: "실수", meaning: "mistake", clue: "A common word in reactions and match analysis.", domains: ["lck", "gaming", "reactions", "everyday"] },
  { key: "regrettable", korean: "아쉽다", dictionaryForm: "아쉽다", meaning: "to feel regrettable; what a shame", clue: "A very common reaction when something was close but not enough.", domains: ["lck", "gaming", "reactions", "kpop", "everyday"] },
  { key: "stage", korean: "무대", dictionaryForm: "무대", meaning: "stage", clue: "The physical stage or a performance setting.", domains: ["kpop", "music"] },
  { key: "performance", korean: "공연", dictionaryForm: "공연", meaning: "performance; show", clue: "A concert, stage show, or live performance.", domains: ["kpop", "music"] },
  { key: "song", korean: "노래", dictionaryForm: "노래", meaning: "song; singing", clue: "One of the highest-frequency music words.", domains: ["kpop", "music", "everyday"] },
  { key: "lyrics", korean: "가사", dictionaryForm: "가사", meaning: "song lyrics", clue: "Used when discussing what a song says.", domains: ["kpop", "music"] },
  { key: "choreography", korean: "안무", dictionaryForm: "안무", meaning: "choreography", clue: "The planned dance for a performance.", domains: ["kpop", "music"] },
  { key: "practice", korean: "연습", dictionaryForm: "연습", meaning: "practice", clue: "Used for dance, vocals, gaming, and everyday skill-building.", domains: ["kpop", "music", "gaming", "everyday"] },
  { key: "vocals", korean: "보컬", dictionaryForm: "보컬", meaning: "vocal; vocalist", clue: "Used for a singer's role or vocal performance.", domains: ["kpop", "music"] },
  { key: "comeback", korean: "컴백", dictionaryForm: "컴백", meaning: "comeback; new promotion period", clue: "In K-pop, a return with new music and promotions.", domains: ["kpop", "music"] },
  { key: "favorite-member", korean: "최애", dictionaryForm: "최애", meaning: "ultimate favorite; bias", clue: "A fan's most-loved member or favorite thing.", domains: ["kpop"] },
  { key: "fan", korean: "팬", dictionaryForm: "팬", meaning: "fan", clue: "Used broadly for supporters of an artist, team, or player.", domains: ["kpop", "music", "lck", "gaming"] },
  { key: "reaction", korean: "반응", dictionaryForm: "반응", meaning: "reaction; response", clue: "Frequent in videos about how someone responded.", domains: ["reactions", "kpop", "everyday"] },
  { key: "funny", korean: "웃기다", dictionaryForm: "웃기다", meaning: "to be funny; make someone laugh", clue: "A direct everyday reaction to something funny.", domains: ["reactions", "kpop", "everyday"] },
  { key: "cute", korean: "귀엽다", dictionaryForm: "귀엽다", meaning: "to be cute", clue: "Extremely common in idol and everyday reactions.", domains: ["reactions", "kpop", "everyday"] },
  { key: "surprised", korean: "놀라다", dictionaryForm: "놀라다", meaning: "to be surprised", clue: "Used when reacting to something unexpected.", domains: ["reactions", "kpop", "everyday"] },
  { key: "amazing", korean: "대박", dictionaryForm: "대박", meaning: "amazing; incredible; jackpot", clue: "An informal exclamation whose tone depends on context.", domains: ["reactions", "kpop", "gaming", "everyday"] },
  { key: "seriously", korean: "진짜", dictionaryForm: "진짜", meaning: "really; seriously; real", clue: "A high-frequency intensifier and reaction word.", domains: ["reactions", "kpop", "gaming", "everyday"] },
  { key: "suddenly", korean: "갑자기", dictionaryForm: "갑자기", meaning: "suddenly", clue: "Useful when explaining an unexpected moment.", domains: ["reactions", "gaming", "everyday"] },
  { key: "feeling", korean: "느낌", dictionaryForm: "느낌", meaning: "feeling; vibe; impression", clue: "Common when describing music, style, or an impression.", domains: ["reactions", "kpop", "music", "everyday"] },
  { key: "today", korean: "오늘", dictionaryForm: "오늘", meaning: "today", clue: "A basic time word that anchors everyday speech.", domains: ["everyday", "general"] },
  { key: "together", korean: "같이", dictionaryForm: "같이", meaning: "together", clue: "Common in invitations and group interactions.", domains: ["everyday", "kpop", "gaming"] },
  { key: "again", korean: "다시", dictionaryForm: "다시", meaning: "again", clue: "Useful for repeats, retries, and returning to something.", domains: ["everyday", "music", "gaming"] },
  { key: "already", korean: "벌써", dictionaryForm: "벌써", meaning: "already", clue: "Often carries a feeling that something happened sooner than expected.", domains: ["everyday", "reactions"] },
  { key: "still", korean: "아직", dictionaryForm: "아직", meaning: "still; yet", clue: "Useful for something continuing or not completed.", domains: ["everyday", "general"] },
  { key: "perhaps", korean: "혹시", dictionaryForm: "혹시", meaning: "by any chance; perhaps", clue: "Softens questions and tentative requests.", domains: ["everyday", "general"] },
];
