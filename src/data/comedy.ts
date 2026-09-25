// Event-driven comedy lines. Adapted from the design kit's COMEDY_BANK (clean/unfiltered variants),
// plus the rider's own voice. A line only plays when its trigger is actually true.

export type Speaker = 'witness' | 'kid' | 'employee' | 'filmer' | 'rider';

export interface Line {
  id: string;
  speaker: Speaker;
  clean: string;
  /** Salty variant (omit when identical). */
  salty?: string;
  /** Spoken delivery tags for expressive TTS (eleven_v3 audio tags). */
  tags?: string;
}

export interface Bark {
  event: string;
  lines: string[]; // line ids, picked in order of freshness
  priority: number;
  chance?: number;
}

export const LINES: Line[] = [
  // --- tricks
  { id: 'first_flip', speaker: 'kid', clean: "That's a kickflip. Apparently.", salty: "That's a kickflip. On a fucking Ryker." },
  { id: 'backflip', speaker: 'witness', clean: 'Very normal way to use handlebars.' },
  { id: 'varial', speaker: 'witness', clean: 'Several axes of poor judgment.' },
  { id: 'big_air', speaker: 'kid', clean: 'Dude. Dude!', salty: 'Dude. What the fuck.', tags: '[astonished]' },
  { id: 'clean_land', speaker: 'witness', clean: 'Excellent landing. Questionable everything else.' },
  { id: 'nice', speaker: 'kid', clean: 'Okay. That was genuinely good.' },
  { id: 'grind', speaker: 'witness', clean: "The rail wasn't expecting a whole vehicle." },
  { id: 'grind2', speaker: 'witness', clean: 'That scrape had several parts to it.' },
  { id: 'bench', speaker: 'employee', clean: "It's a bench. You're taking the instruction too literally." },
  { id: 'nose', speaker: 'witness', clean: 'He brought three wheels and used the front two.' },
  { id: 'rear', speaker: 'witness', clean: "That's two perfectly good wheels you're ignoring." },
  { id: 'respect', speaker: 'kid', clean: 'I hate that you actually landed that.', salty: 'I hate how fucking good that was.' },
  { id: 'cooking', speaker: 'kid', clean: "Oh, he's cooking now." },
  { id: 'selfie', speaker: 'filmer', clean: 'Is he... filming himself? He is filming himself.' },
  // --- hanging on
  { id: 'still_driving', speaker: 'kid', clean: 'Still driving. Technically.' },
  { id: 'accessory', speaker: 'witness', clean: 'He is no longer the operator. He is an accessory.' },
  { id: 'hostage', speaker: 'witness', clean: "That's not a Superman. That's a hostage situation." },
  { id: 'seat_customer', speaker: 'witness', clean: 'The seat has lost its largest customer.' },
  { id: 'oh_no', speaker: 'filmer', clean: 'Oh no. Oh no no no no.', salty: 'Oh shit. Oh shit oh shit oh shit.', tags: '[panicked]' },
  { id: 'sir', speaker: 'employee', clean: 'Sir. Sir! SIR.', tags: '[exasperated]' },
  { id: 'taking_him', speaker: 'witness', clean: 'At this point the bike is taking him somewhere.' },
  { id: 'one_hand', speaker: 'witness', clean: "That's a lot of vehicle for one hand.", salty: 'One hand. Entire fucking vehicle.' },
  // --- recovery
  { id: 'meant_that', speaker: 'witness', clean: 'Absolutely meant that. No further questions.', salty: 'Meant that. Shut up.' },
  { id: 'pretend', speaker: 'kid', clean: "I'm going to need you to pretend that was skill.", salty: 'That was skill. Probably. Fuck it, it counts.' },
  { id: 'system', speaker: 'witness', clean: 'He has a system. It appears to be panic.' },
  { id: 'one_hand_save', speaker: 'witness', clean: 'One hand was enough. Somehow.' },
  // --- bails
  { id: 'third_wheel', speaker: 'witness', clean: 'You added a third wheel and somehow reduced your options.' },
  { id: 'endings', speaker: 'witness', clean: 'Strong opening. Several unrelated endings.' },
  { id: 'good_time', speaker: 'kid', clean: "Bike's still having a good time." },
  { id: 'left_rider', speaker: 'witness', clean: 'The ride has left the rider.' },
  { id: 'momentum', speaker: 'witness', clean: "The plan stopped. The momentum didn't." },
  { id: 'got_it', speaker: 'filmer', clean: 'I got it. I got ALL of it.', salty: 'I got all of that. Holy shit.', tags: '[excited]' },
  { id: 'staffing', speaker: 'witness', clean: 'The bike has completed the trick. Staffing remains unresolved.' },
  { id: 'continue_without', speaker: 'witness', clean: 'Your vehicle would like to continue without you.' },
  { id: 'well', speaker: 'witness', clean: 'Well. That happened.', salty: 'Well, shit.' },
  { id: 'park_man', speaker: 'employee', clean: "You can't park the man there." },
  { id: 'hat', speaker: 'filmer', clean: 'His hat! Where did his hat go?', tags: '[laughing]' },
  // --- world
  { id: 'not_that_kind', speaker: 'employee', clean: 'No. Not that kind of three-wheeler.' },
  { id: 'cones', speaker: 'employee', clean: 'Those are municipal cones.' },
  { id: 'write_down', speaker: 'witness', clean: 'Somebody write that down.' },
  { id: 'valet', speaker: 'witness', clean: 'Valet parking. The rider was not consulted.' },
  // --- the rider himself
  { id: 'r_whoa', speaker: 'rider', clean: 'Whoa whoa whoa WHOA—', tags: '[panicked]' },
  { id: 'r_got_it', speaker: 'rider', clean: 'I got it! I got it! I do not got it!', tags: '[strained]' },
  { id: 'r_nope', speaker: 'rider', clean: 'Nope. Nope nope nope!', tags: '[shouting]' },
  { id: 'r_wont_stop', speaker: 'rider', clean: "It won't stop! Why won't it stop?!", tags: '[panicked]' },
  { id: 'r_im_good', speaker: 'rider', clean: "...I'm good. I'm good!", tags: '[breathless]' },
  { id: 'r_meant', speaker: 'rider', clean: 'Meant to do that.', tags: '[proudly]' },
  { id: 'r_yeehaw', speaker: 'rider', clean: 'YEEHAW!', tags: '[whooping]' },
  { id: 'r_oof', speaker: 'rider', clean: 'Ohhh... that was the good jacket.', tags: '[groaning]' },
  { id: 'r_okay', speaker: 'rider', clean: 'Heh. Okay. Okay.', tags: '[nervous laugh]' },
  { id: 'r_hold_on', speaker: 'rider', clean: 'Hold on. HOLD ON!', tags: '[shouting]' },
];

/** Which lines can react to which (truthful) situation. */
export const BARKS: Bark[] = [
  { event: 'first_flip', lines: ['first_flip'], priority: 85 },
  { event: 'backflip', lines: ['backflip'], priority: 40, chance: 0.6 },
  { event: 'special', lines: ['varial', 'respect'], priority: 60 },
  { event: 'big_air', lines: ['big_air', 'r_yeehaw'], priority: 45, chance: 0.5 },
  { event: 'clean_trick_land', lines: ['clean_land', 'nice'], priority: 25, chance: 0.25 },
  { event: 'grind', lines: ['grind', 'grind2'], priority: 35, chance: 0.5 },
  { event: 'bench', lines: ['bench'], priority: 50 },
  { event: 'nose_manual', lines: ['nose'], priority: 30, chance: 0.5 },
  { event: 'rear_manual', lines: ['rear'], priority: 30, chance: 0.4 },
  { event: 'big_combo', lines: ['respect', 'write_down'], priority: 60 },
  { event: 'special_ready', lines: ['cooking'], priority: 30, chance: 0.6 },
  { event: 'selfie', lines: ['selfie'], priority: 40, chance: 0.7 },
  { event: 'hang', lines: ['still_driving', 'accessory', 'oh_no', 'seat_customer', 'sir', 'hostage'], priority: 65 },
  { event: 'hang_long', lines: ['taking_him'], priority: 35 },
  { event: 'grip_lost', lines: ['one_hand'], priority: 65 },
  { event: 'recovered', lines: ['meant_that', 'pretend', 'system'], priority: 70 },
  { event: 'recovered_one_hand', lines: ['one_hand_save'], priority: 75 },
  { event: 'detached_moving', lines: ['good_time', 'left_rider', 'momentum', 'third_wheel'], priority: 55 },
  { event: 'detached', lines: ['endings', 'got_it', 'third_wheel'], priority: 50 },
  { event: 'empty_landed', lines: ['staffing'], priority: 75 },
  { event: 'empty_settled', lines: ['continue_without'], priority: 30 },
  { event: 'settled', lines: ['well', 'park_man'], priority: 25 },
  { event: 'helmet', lines: ['hat'], priority: 40, chance: 0.5 },
  { event: 'run_start', lines: ['not_that_kind'], priority: 40 },
  { event: 'cones', lines: ['cones'], priority: 35 },
  { event: 'valet', lines: ['valet'], priority: 80 },
];

/** The rider's own exclamations (short, own cooldown — they're effort sounds, not commentary). */
export const RIDER_BARKS: Record<string, string[]> = {
  hang: ['r_whoa', 'r_hold_on', 'r_nope'],
  hang_speeding: ['r_wont_stop', 'r_got_it'],
  recovered: ['r_im_good', 'r_meant'],
  detached: ['r_oof'],
  sketchy: ['r_okay'],
  big_air: ['r_yeehaw'],
};

export const VOICES: Record<Speaker, { id: string; name: string; stability: number; style: number }> = {
  witness: { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', stability: 0.5, style: 0.25 },
  kid: { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', stability: 0.45, style: 0.3 },
  employee: { id: '6vKYb0tACWVRUpKIguhH', name: 'Dave', stability: 0.55, style: 0.2 },
  filmer: { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', stability: 0.35, style: 0.45 },
  rider: { id: 'Bj9UqZbhQsanLzgalpEG', name: 'Austin Knox', stability: 0.3, style: 0.55 },
};

export function lineText(l: Line, lang: 'clean' | 'salty') {
  return lang === 'salty' && l.salty ? l.salty : l.clean;
}

/** Audio file for a line in a language (salty file only exists when the text differs). */
export function lineFile(l: Line, lang: 'clean' | 'salty') {
  return lang === 'salty' && l.salty ? `vo/${l.id}.salty.mp3` : `vo/${l.id}.mp3`;
}
