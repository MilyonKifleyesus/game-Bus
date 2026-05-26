import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Player = {
  id: string;
  name: string;
  avatar: string;
  vehicle: string | null;
};

export type GameSetupData = {
  mode: 'solo' | 'friends';
  players: Player[];
  difficulty: 1 | 2 | 3;
};

type Step = 'lobby' | 'players' | 'vehicles' | 'difficulty';

// ── Static data (mirrors game-scene.js) ───────────────────────────────────────

const AVATARS = ['🦊','🐺','🐱','🐸','🦁','🐯','🐻','🦝','🐨','🦄','🐙','🦅'];

const PLAYER_COLORS = ['#ffdd44','#44aaff','#ff5577','#44ffaa','#ff8844','#cc88ff'];

const VEHICLES: Record<string, { name: string; color: string; topSpeed: number; handling: number; drift: number; boost: number; desc: string }> = {
  taxi:     { name: 'City Pod',   color: '#00e5cc', topSpeed: 0.40, handling: 0.028, drift: 1.00, boost: 1.00, desc: 'Free starter EV — balanced & reliable' },
  sports:   { name: 'Volt X',    color: '#ff2266', topSpeed: 0.50, handling: 0.025, drift: 0.90, boost: 1.15, desc: 'High-performance electric sports car' },
  police:   { name: 'Patrol E',  color: '#4488ff', topSpeed: 0.43, handling: 0.030, drift: 0.95, boost: 1.30, desc: 'Electric patrol cruiser — huge boost' },
  bus:      { name: 'E-Transit', color: '#22cc66', topSpeed: 0.37, handling: 0.026, drift: 0.90, boost: 0.95, desc: 'Electric van — crash resistant tank' },
  drift:    { name: 'Arc Racer', color: '#aa44ff', topSpeed: 0.42, handling: 0.032, drift: 1.40, boost: 1.05, desc: 'EV drift machine — maximum slide' },
  delivery: { name: 'E-Cargo',   color: '#ff6600', topSpeed: 0.39, handling: 0.029, drift: 1.00, boost: 1.00, desc: 'Electric cargo van — mission master' },
};

const LEVELS: Record<number, { name: string; color: string; desc: string; sub: string }> = {
  1: { name: 'EASY',   color: '#44ff88', desc: 'No traffic',           sub: 'Just you and the open road' },
  2: { name: 'MEDIUM', color: '#ffaa00', desc: '3 opponent cars',      sub: 'Dodge traffic on the circuit' },
  3: { name: 'HARD',   color: '#ff4444', desc: 'Cars + crate obstacles', sub: 'Maximum chaos everywhere' },
};

// ── Shared UI helpers ─────────────────────────────────────────────────────────

const BASE: React.CSSProperties = {
  position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(14px)',
  fontFamily: '"Fredoka","Lilita One",sans-serif', color: '#fff', zIndex: 600,
  overflowY: 'auto',
};

const CARD: React.CSSProperties = {
  background: 'rgba(12,12,20,0.94)', border: '2px solid rgba(255,255,255,0.15)',
  borderRadius: 22, padding: '32px 28px', width: 'min(520px, 94vw)',
  boxShadow: '0 12px 0 rgba(0,0,0,0.4)',
};

const LABEL: React.CSSProperties = {
  fontSize: 12, letterSpacing: 3, color: 'rgba(255,255,255,0.45)',
  fontWeight: 700, marginBottom: 8, textTransform: 'uppercase',
};

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>
        <span>{label}</span><span style={{ color }}>{pct}%</span>
      </div>
      <div style={{ height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function Btn({ children, onClick, color = '#fff', style }: { children: React.ReactNode; onClick: () => void; color?: string; style?: React.CSSProperties }) {
  return (
    <button
      onClick={onClick}
      style={{
        cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: 15,
        color, background: 'rgba(255,255,255,0.08)', border: `2px solid ${color}40`,
        borderRadius: 14, padding: '11px 22px', transition: 'all 0.15s',
        boxShadow: '0 4px 0 rgba(0,0,0,0.3)', ...style,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${color}22`; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
    >
      {children}
    </button>
  );
}

function SetupVirtualController({ step }: { step: Step }) {
  useEffect(() => {
    let selected = 0;
    let lastMove = 0;
    const controller = document.createElement('div');
    controller.setAttribute('aria-label', 'Setup virtual joystick controller');
    controller.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:190px;z-index:900;pointer-events:none;font-family:"Fredoka","Lilita One",sans-serif;color:#eaffff;';
    controller.innerHTML = `
      <style>
        .setup-vc-stick{position:absolute;left:22px;bottom:28px;width:142px;height:142px;border-radius:30px;pointer-events:auto;touch-action:none;cursor:grab;background:linear-gradient(135deg,rgba(0,255,255,.14),rgba(255,0,255,.12));border:2px solid rgba(120,240,255,.62);box-shadow:0 0 28px rgba(0,255,255,.24),inset 0 0 24px rgba(255,255,255,.08);backdrop-filter:blur(12px)}
        .setup-vc-stick:before{content:"";position:absolute;inset:16px;border-radius:50%;border:2px solid rgba(255,255,255,.48);background:radial-gradient(circle,rgba(0,255,255,.18),rgba(0,0,0,.22))}
        .setup-vc-thumb{position:absolute;left:50%;top:50%;width:58px;height:58px;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle at 35% 25%,#fff7a2,#ffdd33 45%,#ff6a00);border:3px solid rgba(255,255,255,.78);box-shadow:0 8px 0 rgba(0,0,0,.35),0 0 24px rgba(255,221,68,.72)}
        .setup-vc-label{position:absolute;left:0;right:0;bottom:-18px;text-align:center;font-size:11px;font-weight:900;letter-spacing:1.2px;text-shadow:0 0 10px #00efff}
        .setup-vc-action{position:absolute;right:26px;bottom:52px;width:96px;height:64px;border-radius:20px;pointer-events:auto;touch-action:none;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:#48efff;background:linear-gradient(135deg,rgba(72,239,255,.22),rgba(255,255,255,.08));border:2px solid rgba(72,239,255,.72);box-shadow:0 7px 0 rgba(0,0,0,.32),0 0 24px rgba(72,239,255,.28)}
        .setup-vc-status{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);width:min(420px,42vw);padding:10px 14px;border-radius:18px;background:rgba(8,14,30,.52);border:2px solid rgba(115,240,255,.45);box-shadow:0 0 22px rgba(0,240,255,.18);backdrop-filter:blur(12px);font-size:11px;font-weight:900;letter-spacing:.8px;text-align:center}
        @media(max-width:760px){.setup-vc-status{display:none}.setup-vc-stick{width:132px;height:132px}.setup-vc-action{right:18px;bottom:48px}}
      </style>
      <div class="setup-vc-stick" data-setup-stick><div class="setup-vc-thumb" data-setup-thumb></div><div class="setup-vc-label">MENU STICK</div></div>
      <div class="setup-vc-status" data-setup-status>JOYSTICK MENU CONTROL | DRAG LEFT/RIGHT | BOOST SELECT</div>
      <div class="setup-vc-action" data-setup-action>SELECT</div>
    `;
    document.body.appendChild(controller);

    const stick = controller.querySelector('[data-setup-stick]') as HTMLDivElement;
    const thumb = controller.querySelector('[data-setup-thumb]') as HTMLDivElement;
    const action = controller.querySelector('[data-setup-action]') as HTMLDivElement;
    const getButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter(btn => !btn.disabled && btn.offsetParent !== null);
    const pulse = (duration = 20) => {
      if (navigator.vibrate) navigator.vibrate(duration);
    };
    const paintFocus = () => {
      const buttons = getButtons();
      if (!buttons.length) return;
      selected = Math.max(0, Math.min(selected, buttons.length - 1));
      buttons.forEach((btn, i) => {
        btn.style.outline = i === selected ? '3px solid rgba(0,255,255,.92)' : '';
        btn.style.boxShadow = i === selected ? '0 0 26px rgba(0,255,255,.72), 0 7px 0 rgba(0,0,0,.35)' : btn.style.boxShadow;
      });
    };
    const moveSelection = (dir: number) => {
      const now = performance.now();
      if (now - lastMove < 240) return;
      const buttons = getButtons();
      if (!buttons.length) return;
      selected = (selected + dir + buttons.length) % buttons.length;
      lastMove = now;
      pulse(12);
      paintFocus();
    };
    const clickSelected = () => {
      const buttons = getButtons();
      if (buttons[selected]) {
        pulse(30);
        buttons[selected].click();
      }
    };
    const updateStick = (e: PointerEvent) => {
      const rect = stick.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const max = rect.width * 0.32;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.min(max, Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx);
      const px = Math.cos(angle) * dist;
      const py = Math.sin(angle) * dist;
      thumb.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
      if (Math.abs(px / max) > 0.55) moveSelection(Math.sign(px));
      if (py / max < -0.72 || py / max > 0.72) clickSelected();
    };
    stick.addEventListener('pointerdown', e => {
      e.preventDefault();
      stick.setPointerCapture(e.pointerId);
      updateStick(e);
    });
    stick.addEventListener('pointermove', e => {
      if (!stick.hasPointerCapture(e.pointerId)) return;
      e.preventDefault();
      updateStick(e);
    });
    const reset = () => { thumb.style.transform = 'translate(-50%,-50%)'; };
    stick.addEventListener('pointerup', reset);
    stick.addEventListener('pointercancel', reset);
    action.addEventListener('pointerdown', e => {
      e.preventDefault();
      clickSelected();
    });
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') moveSelection(-1);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') moveSelection(1);
      if (e.key === 'Enter' || e.key === ' ') clickSelected();
    };
    window.addEventListener('keydown', keyHandler);
    const interval = window.setInterval(paintFocus, 300);
    paintFocus();
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('keydown', keyHandler);
      controller.remove();
    };
  }, [step]);

  return null;
}

// ── Step 1: Lobby ─────────────────────────────────────────────────────────────

function LobbyScreen({ onSolo, onFriends }: { onSolo: () => void; onFriends: () => void }) {
  return (
    <div style={BASE}>
      <div style={{ ...CARD, textAlign: 'center' }}>
        <div style={LABEL}>Welcome to</div>
        <div style={{ fontSize: 52, fontWeight: 900, fontFamily: '"Lilita One",sans-serif', letterSpacing: 1, WebkitTextStroke: '2px rgba(0,0,0,0.3)', textShadow: '0 5px 0 rgba(0,0,0,0.4)', marginBottom: 8 }}>
          DRIFT ARCADE
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 40 }}>Choose your game mode</div>

        <div style={{ display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap' }}>
          {/* Solo */}
          <button
            onClick={onSolo}
            style={{
              cursor: 'pointer', fontFamily: 'inherit', width: 200, padding: '32px 20px',
              background: 'rgba(255,221,68,0.08)', border: '3px solid rgba(255,221,68,0.35)',
              borderRadius: 20, color: '#fff', transition: 'all 0.2s', boxShadow: '0 6px 0 rgba(0,0,0,0.35)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,221,68,0.18)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-4px)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,221,68,0.08)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
          >
            <div style={{ fontSize: 40, marginBottom: 10 }}>🏎️</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#ffdd44', fontFamily: '"Lilita One",sans-serif' }}>SOLO</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>Play by yourself</div>
          </button>

          {/* Friends */}
          <button
            onClick={onFriends}
            style={{
              cursor: 'pointer', fontFamily: 'inherit', width: 200, padding: '32px 20px',
              background: 'rgba(68,170,255,0.08)', border: '3px solid rgba(68,170,255,0.35)',
              borderRadius: 20, color: '#fff', transition: 'all 0.2s', boxShadow: '0 6px 0 rgba(0,0,0,0.35)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(68,170,255,0.18)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-4px)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(68,170,255,0.08)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
          >
            <div style={{ fontSize: 40, marginBottom: 10 }}>👥</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#44aaff', fontFamily: '"Lilita One",sans-serif' }}>FRIENDS</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>Add multiple players</div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Player Setup ──────────────────────────────────────────────────────

function PlayerSetup({ players, onChange, onBack, onNext }: {
  players: Player[];
  onChange: (players: Player[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const addPlayer = () => {
    if (players.length >= 6) return;
    onChange([...players, {
      id: `p${Date.now()}`,
      name: `Player ${players.length + 1}`,
      avatar: AVATARS[players.length % AVATARS.length],
      vehicle: null,
    }]);
  };

  const removePlayer = (id: string) => {
    if (players.length <= 2) return;
    onChange(players.filter(p => p.id !== id));
  };

  const updatePlayer = (id: string, patch: Partial<Player>) => {
    onChange(players.map(p => p.id === id ? { ...p, ...patch } : p));
  };

  return (
    <div style={BASE}>
      <div style={{ ...CARD, width: 'min(600px,94vw)' }}>
        <div style={LABEL}>Step 2 of 4</div>
        <div style={{ fontSize: 36, fontWeight: 900, fontFamily: '"Lilita One",sans-serif', marginBottom: 6 }}>PLAYERS</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 24 }}>Enter each player's name and pick a character</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24, maxHeight: '55vh', overflowY: 'auto', paddingRight: 4 }}>
          {players.map((player, idx) => {
            const pColor = PLAYER_COLORS[idx] ?? '#fff';
            return (
              <div key={player.id} style={{ background: 'rgba(255,255,255,0.05)', border: `2px solid ${pColor}33`, borderRadius: 16, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: pColor, minWidth: 64 }}>PLAYER {idx + 1}</div>
                  <input
                    value={player.name}
                    onChange={e => updatePlayer(player.id, { name: e.target.value })}
                    maxLength={16}
                    placeholder="Enter name..."
                    style={{
                      flex: 1, background: 'rgba(255,255,255,0.08)', border: `1.5px solid ${pColor}44`,
                      borderRadius: 10, padding: '7px 12px', color: '#fff', fontFamily: 'inherit',
                      fontSize: 15, fontWeight: 700, outline: 'none',
                    }}
                  />
                  {players.length > 2 && (
                    <button
                      onClick={() => removePlayer(player.id)}
                      style={{ cursor: 'pointer', background: 'rgba(255,60,60,0.12)', border: '1.5px solid rgba(255,60,60,0.35)', color: '#ff6666', borderRadius: 8, padding: '5px 10px', fontFamily: 'inherit', fontWeight: 800, fontSize: 12 }}
                    >✕</button>
                  )}
                </div>
                {/* Avatar picker */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {AVATARS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => updatePlayer(player.id, { avatar: emoji })}
                      style={{
                        cursor: 'pointer', fontSize: 22, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 10, border: player.avatar === emoji ? `2px solid ${pColor}` : '2px solid transparent',
                        background: player.avatar === emoji ? `${pColor}22` : 'rgba(255,255,255,0.06)',
                        transition: 'all 0.12s',
                      }}
                    >{emoji}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {players.length < 6 && (
          <button
            onClick={addPlayer}
            style={{ cursor: 'pointer', width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', border: '2px dashed rgba(255,255,255,0.2)', borderRadius: 14, color: 'rgba(255,255,255,0.5)', fontFamily: 'inherit', fontWeight: 700, fontSize: 14, marginBottom: 20 }}
          >+ Add Player ({players.length}/6)</button>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <Btn onClick={onBack} color="rgba(255,255,255,0.5)">← Back</Btn>
          <Btn
            onClick={onNext}
            color="#44aaff"
            style={{ opacity: players.every(p => p.name.trim()) ? 1 : 0.4, pointerEvents: players.every(p => p.name.trim()) ? 'auto' : 'none' }}
          >Next →</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Vehicle Select (per player) ───────────────────────────────────────

function VehicleSelect({ players, playerIdx, onPick, onBack }: {
  players: Player[];
  playerIdx: number;
  onPick: (vehicleId: string) => void;
  onBack: () => void;
}) {
  const player = players[playerIdx];
  const pColor = PLAYER_COLORS[playerIdx] ?? '#fff';
  const takenVehicles = players.filter((pl, i) => i !== playerIdx && pl.vehicle != null).map(pl => pl.vehicle!);

  return (
    <div style={BASE}>
      <div style={{ ...CARD, width: 'min(680px,96vw)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 34 }}>{player.avatar}</span>
          <div>
            <div style={LABEL}>Step 3 of 4 — Player {playerIdx + 1} of {players.length}</div>
            <div style={{ fontSize: 28, fontWeight: 900, fontFamily: '"Lilita One",sans-serif', color: pColor }}>
              {player.name}, pick your ride
            </div>
          </div>
        </div>

        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>
          {playerIdx < players.length - 1 ? `${players.length - playerIdx - 1} more player(s) after you` : 'Last player — almost ready!'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(185px,1fr))', gap: 10, marginBottom: 24 }}>
          {Object.entries(VEHICLES).map(([id, v]) => {
            const taken = takenVehicles.includes(id);
            const selected = player.vehicle === id;
            return (
              <button
                key={id}
                onClick={() => !taken && onPick(id)}
                disabled={taken}
                style={{
                  cursor: taken ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit', textAlign: 'left', padding: '14px', borderRadius: 16,
                  background: selected ? `${v.color}18` : taken ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)',
                  border: `2px solid ${selected ? v.color : taken ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.18)'}`,
                  opacity: taken ? 0.4 : 1, transition: 'all 0.15s',
                  boxShadow: selected ? `0 0 18px ${v.color}44, 0 5px 0 rgba(0,0,0,0.3)` : '0 4px 0 rgba(0,0,0,0.25)',
                }}
                onMouseEnter={e => { if (!taken) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 20, height: 14, borderRadius: 4, background: v.color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 17, fontWeight: 900, color: taken ? 'rgba(255,255,255,0.4)' : '#fff' }}>{v.name}</span>
                  {taken && <span style={{ fontSize: 10, color: '#ff6666', marginLeft: 'auto', fontWeight: 700 }}>TAKEN</span>}
                  {selected && <span style={{ fontSize: 10, color: v.color, marginLeft: 'auto', fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>{v.desc}</div>
                <StatBar label="Speed"    value={v.topSpeed}  max={0.50} color={v.color} />
                <StatBar label="Handling" value={v.handling}  max={0.032} color={v.color} />
                <StatBar label="Drift"    value={v.drift}     max={1.40} color={v.color} />
                <StatBar label="Boost"    value={v.boost}     max={1.30} color={v.color} />
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <Btn onClick={onBack} color="rgba(255,255,255,0.5)">← Back</Btn>
          <Btn
            onClick={() => player.vehicle && onPick(player.vehicle)}
            color={pColor}
            style={{ opacity: player.vehicle ? 1 : 0.35, pointerEvents: player.vehicle ? 'auto' : 'none' }}
          >{playerIdx < players.length - 1 ? 'Next Player →' : 'Choose Difficulty →'}</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Step 4: Difficulty ────────────────────────────────────────────────────────

function DifficultySelect({ players, onPick, onBack }: {
  players: Player[];
  onPick: (lvl: 1 | 2 | 3) => void;
  onBack: () => void;
}) {
  return (
    <div style={BASE}>
      <div style={{ ...CARD, textAlign: 'center', width: 'min(580px,94vw)' }}>
        <div style={LABEL}>Step 4 of 4</div>
        <div style={{ fontSize: 44, fontWeight: 900, fontFamily: '"Lilita One",sans-serif', WebkitTextStroke: '2px rgba(0,0,0,0.25)', textShadow: '0 5px 0 rgba(0,0,0,0.35)', marginBottom: 6 }}>DIFFICULTY</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 28 }}>Same for all {players.length > 1 ? `${players.length} players` : 'players'}</div>

        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
          {([1, 2, 3] as const).map(lvl => {
            const l = LEVELS[lvl];
            return (
              <button
                key={lvl}
                onClick={() => onPick(lvl)}
                style={{
                  cursor: 'pointer', fontFamily: 'inherit', width: 160, padding: '26px 16px',
                  background: 'rgba(255,255,255,0.07)', border: `3px solid ${l.color}55`,
                  borderRadius: 20, color: '#fff', transition: 'all 0.2s', boxShadow: '0 6px 0 rgba(0,0,0,0.35)',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = `${l.color}18`;
                  el.style.borderColor = l.color;
                  el.style.transform = 'translateY(-4px)';
                  el.style.boxShadow = `0 10px 0 rgba(0,0,0,0.35), 0 0 24px ${l.color}44`;
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.background = 'rgba(255,255,255,0.07)';
                  el.style.borderColor = `${l.color}55`;
                  el.style.transform = 'translateY(0)';
                  el.style.boxShadow = '0 6px 0 rgba(0,0,0,0.35)';
                }}
              >
                <div style={{ fontSize: 36, fontWeight: 900, color: l.color, fontFamily: '"Lilita One",sans-serif', textShadow: `0 3px 0 rgba(0,0,0,0.3)`, marginBottom: 8 }}>{l.name}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{l.desc}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{l.sub}</div>
              </button>
            );
          })}
        </div>

        {/* Player summary strip */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
          {players.map((p, i) => {
            const pColor = PLAYER_COLORS[i] ?? '#fff';
            const vColor = p.vehicle ? VEHICLES[p.vehicle]?.color : '#888';
            return (
              <div key={p.id} style={{ background: 'rgba(255,255,255,0.06)', border: `1.5px solid ${pColor}33`, borderRadius: 12, padding: '8px 12px', textAlign: 'center', minWidth: 80 }}>
                <div style={{ fontSize: 22 }}>{p.avatar}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: pColor, marginTop: 2 }}>{p.name}</div>
                {p.vehicle && <div style={{ fontSize: 10, color: vColor, marginTop: 2 }}>{VEHICLES[p.vehicle]?.name}</div>}
              </div>
            );
          })}
        </div>

        <Btn onClick={onBack} color="rgba(255,255,255,0.5)">← Back</Btn>
      </div>
    </div>
  );
}

// ── Root orchestrator ─────────────────────────────────────────────────────────

export default function GameSetup({ onComplete }: { onComplete: (data: GameSetupData) => void }) {
  const [step, setStep] = useState<Step>('lobby');
  const [mode, setMode] = useState<'solo' | 'friends'>('solo');
  const [players, setPlayers] = useState<Player[]>([]);
  const [vehiclePlayerIdx, setVehiclePlayerIdx] = useState(0);

  const handleSolo = () => {
    setMode('solo');
    const solo: Player[] = [{ id: 'p1', name: 'Player 1', avatar: '🦊', vehicle: null }];
    setPlayers(solo);
    setVehiclePlayerIdx(0);
    setStep('vehicles');
  };

  const handleFriends = () => {
    setMode('friends');
    const initial: Player[] = [
      { id: 'p1', name: 'Player 1', avatar: '🦊', vehicle: null },
      { id: 'p2', name: 'Player 2', avatar: '🐺', vehicle: null },
    ];
    setPlayers(initial);
    setStep('players');
  };

  const handleVehiclePick = (vehicleId: string) => {
    const updated = players.map((p, i) => i === vehiclePlayerIdx ? { ...p, vehicle: vehicleId } : p);
    setPlayers(updated);

    if (vehiclePlayerIdx < players.length - 1) {
      setVehiclePlayerIdx(vehiclePlayerIdx + 1);
    } else {
      setStep('difficulty');
    }
  };

  const handleDifficulty = (lvl: 1 | 2 | 3) => {
    onComplete({ mode, players, difficulty: lvl });
  };

  if (step === 'lobby') {
    return <>
      <LobbyScreen onSolo={handleSolo} onFriends={handleFriends} />
      <SetupVirtualController step={step} />
    </>;
  }

  if (step === 'players') {
    return (
      <>
        <PlayerSetup
          players={players}
          onChange={setPlayers}
          onBack={() => setStep('lobby')}
          onNext={() => { setVehiclePlayerIdx(0); setStep('vehicles'); }}
        />
        <SetupVirtualController step={step} />
      </>
    );
  }

  if (step === 'vehicles') {
    return (
      <>
        <VehicleSelect
          players={players}
          playerIdx={vehiclePlayerIdx}
          onPick={handleVehiclePick}
          onBack={() => {
            if (vehiclePlayerIdx > 0) {
              // Clear current and previous player's vehicle, go back one
              setPlayers(players.map((p, i) => i >= vehiclePlayerIdx - 1 ? { ...p, vehicle: null } : p));
              setVehiclePlayerIdx(vehiclePlayerIdx - 1);
            } else {
              // First player going back
              setPlayers(players.map(p => ({ ...p, vehicle: null })));
              setStep(mode === 'friends' ? 'players' : 'lobby');
            }
          }}
        />
        <SetupVirtualController step={step} />
      </>
    );
  }

  return (
    <>
      <DifficultySelect
        players={players}
        onPick={handleDifficulty}
        onBack={() => {
          setPlayers(players.map((p, i) => i === players.length - 1 ? { ...p, vehicle: null } : p));
          setVehiclePlayerIdx(players.length - 1);
          setStep('vehicles');
        }}
      />
      <SetupVirtualController step={step} />
    </>
  );
}
