// Spoken lines, using the voices built into the browser (speechSynthesis):
// Dre, Okafor, Voss and Vince giving you jobs, you answering back, the
// police dispatcher, people in
// the street. Subtitles always show, so a browser without voices loses
// nothing but the sound. Can be switched off in Settings. (From Cinder
// Peak.)

const STYLE = {
  okafor: { pitch: 0.85, rate: 0.98, sex: 'm' },
  voss: { pitch: 0.92, rate: 0.96, sex: 'f' },
  dre: { pitch: 1.08, rate: 1.14, sex: 'm' },
  vince: { pitch: 0.72, rate: 0.9, sex: 'm', volume: 0.9 },
  you: { pitch: 0.95, rate: 1.02, sex: 'm' },
  brill: { pitch: 0.6, rate: 1.05, sex: 'm' },
  radio: { pitch: 1.1, rate: 1.1, sex: 'f', volume: 0.75 },
  ped: { pitch: 1.05, rate: 1.15, sex: null, volume: 0.6 },
  cop: { pitch: 0.8, rate: 1.1, sex: 'm', volume: 0.7 },
  narrator: { pitch: 0.9, rate: 0.9, sex: 'm', volume: 0.9 },
  friend: { pitch: 1.0, rate: 1.08, sex: null },
};

const FEMALE = /female|woman|samantha|victoria|karen|zira|susan|moira|tessa|fiona|serena|hazel|kate|allison|ava|joanna|salli|kimberly|emma|amy|aria|jenny|libby|sonia/i;
const MALE = /male|man\b|daniel|alex|fred|david|mark|george|james|guy|ryan|tom|aaron|arthur|oliver|rishi|lee/i;

class Voice {
  constructor() {
    this.enabled = true;
    this.volume = 0.8;
    this.voices = [];
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.synth = synth || null;
    if (synth) {
      const load = () => { this.voices = synth.getVoices().filter((v) => /^en/i.test(v.lang)); };
      load();
      synth.addEventListener?.('voiceschanged', load);
    }
  }

  pick(sex, salt = 0) {
    const vs = this.voices;
    if (!vs.length) return null;
    const pool = sex === 'f' ? vs.filter((v) => FEMALE.test(v.name)) : sex === 'm' ? vs.filter((v) => MALE.test(v.name) && !FEMALE.test(v.name)) : vs;
    const list = pool.length ? pool : vs;
    return list[salt % list.length];
  }

  // kind: one of STYLE's keys; salt picks between voices so different
  // friends sound different
  say(text, kind = 'friend', { salt = 0, sex = null } = {}) {
    if (!this.enabled || !this.synth || !text || text === '...' || text.startsWith('(')) return;
    const st = STYLE[kind] || STYLE.friend;
    // keep up with the conversation rather than queueing a backlog
    if (this.synth.pending || this.synth.speaking) {
      this.queued = (this.queued || 0) + 1;
      if (this.queued > 1) { this.synth.cancel(); this.queued = 0; }
    } else this.queued = 0;
    const u = new SpeechSynthesisUtterance(text.replace(/\.\.\./g, ', '));
    const v = this.pick(st.sex || sex, salt);
    if (v) u.voice = v;
    u.pitch = st.pitch;
    u.rate = st.rate;
    u.volume = Math.min(1, this.volume * (st.volume ?? 1));
    this.synth.speak(u);
  }

  stop() {
    if (this.synth) this.synth.cancel();
  }
}

export const voice = new Voice();
