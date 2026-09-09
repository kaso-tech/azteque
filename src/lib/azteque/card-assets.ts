import type { Rank, Suit } from "./engine";
import cardBack from "@/assets/cards/card_back.svg";
import spade7 from "@/assets/cards/7_spade.svg";
import spade8 from "@/assets/cards/8_spade.svg";
import spade9 from "@/assets/cards/9_spade.svg";
import spadeJack from "@/assets/cards/jack_spade.svg";
import spadeQueen from "@/assets/cards/queen_spade.svg";
import spadeKing from "@/assets/cards/king_spade.svg";
import spadeTen from "@/assets/cards/10_spade.svg";
import spadeAce from "@/assets/cards/ace_spade.svg";
import heart7 from "@/assets/cards/7_heart.svg";
import heart8 from "@/assets/cards/8_heart.svg";
import heart9 from "@/assets/cards/9_heart.svg";
import heartJack from "@/assets/cards/jack_heart.svg";
import heartQueen from "@/assets/cards/queen_heart.svg";
import heartKing from "@/assets/cards/king_heart.svg";
import heartTen from "@/assets/cards/10_heart.svg";
import heartAce from "@/assets/cards/ace_heart.svg";
import diamond7 from "@/assets/cards/7_diamond.svg";
import diamond8 from "@/assets/cards/8_diamond.svg";
import diamond9 from "@/assets/cards/9_diamond.svg";
import diamondJack from "@/assets/cards/jack_diamond.svg";
import diamondQueen from "@/assets/cards/queen_diamond.svg";
import diamondKing from "@/assets/cards/king_diamond.svg";
import diamondTen from "@/assets/cards/10_diamond.svg";
import diamondAce from "@/assets/cards/ace_diamond.svg";
import club7 from "@/assets/cards/7_club.svg";
import club8 from "@/assets/cards/8_club.svg";
import club9 from "@/assets/cards/9_club.svg";
import clubJack from "@/assets/cards/jack_club.svg";
import clubQueen from "@/assets/cards/queen_club.svg";
import clubKing from "@/assets/cards/king_club.svg";
import clubTen from "@/assets/cards/10_club.svg";
import clubAce from "@/assets/cards/ace_club.svg";

const CARD_ASSETS: Record<Suit, Record<Rank, string>> = {
  S: {
    "7": spade7,
    "8": spade8,
    "9": spade9,
    J: spadeJack,
    Q: spadeQueen,
    K: spadeKing,
    "10": spadeTen,
    A: spadeAce,
  },
  H: {
    "7": heart7,
    "8": heart8,
    "9": heart9,
    J: heartJack,
    Q: heartQueen,
    K: heartKing,
    "10": heartTen,
    A: heartAce,
  },
  D: {
    "7": diamond7,
    "8": diamond8,
    "9": diamond9,
    J: diamondJack,
    Q: diamondQueen,
    K: diamondKing,
    "10": diamondTen,
    A: diamondAce,
  },
  C: {
    "7": club7,
    "8": club8,
    "9": club9,
    J: clubJack,
    Q: clubQueen,
    K: clubKing,
    "10": clubTen,
    A: clubAce,
  },
};

export function getCardAsset(rank: Rank, suit: Suit): string {
  return CARD_ASSETS[suit][rank];
}

export const CARD_BACK_ASSET = cardBack;
export { CARD_ASSETS };
