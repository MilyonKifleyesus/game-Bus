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
    let selIdx = 0;
    let lastNav = 0;
    const gpHeld: Record<number, boolean> = {};
    let rafId = 0;

    // ── DOM ──────────────────────────────────────────────────────────────────
    const root = document.createElement('div');
    root.setAttribute('aria-label', 'Setup virtual joystick controller');
    root.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:190px;z-index:900;pointer-events:none;font-family:"Fredoka","Lilita One",sans-serif;color:#eaffff;';
    root.innerHTML = `
      <style>
        .svc-stick{position:absolute;left:22px;bottom:28px;width:142px;height:142px;border-radius:30px;pointer-events:auto;touch-action:none;cursor:grab;background:linear-gradient(135deg,rgba(0,255,255,.14),rgba(255,0,255,.12));border:2px solid rgba(120,240,255,.62);box-shadow:0 0 28px rgba(0,255,255,.24),inset 0 0 24px rgba(255,255,255,.08);backdrop-filter:blur(12px)}
        .svc-stick:before{content:"";position:absolute;inset:16px;border-radius:50%;border:2px solid rgba(255,255,255,.48);background:radial-gradient(circle,rgba(0,255,255,.18),rgba(0,0,0,.22))}
        .svc-thumb{position:absolute;left:50%;top:50%;width:58px;height:58px;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle at 35% 25%,#fff7a2,#ffdd33 45%,#ff6a00);border:3px solid rgba(255,255,255,.78);box-shadow:0 8px 0 rgba(0,0,0,.35),0 0 24px rgba(255,221,68,.72)}
        .svc-label{position:absolute;left:0;right:0;bottom:-18px;text-align:center;font-size:11px;font-weight:900;letter-spacing:1.2px;text-shadow:0 0 10px #00efff}
        .svc-action{position:absolute;right:26px;bottom:52px;width:96px;height:64px;border-radius:20px;pointer-events:auto;touch-action:none;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:#48efff;background:linear-gradient(135deg,rgba(72,239,255,.22),rgba(255,255,255,.08));border:2px solid rgba(72,239,255,.72);box-shadow:0 7px 0 rgba(0,0,0,.32),0 0 24px rgba(72,239,255,.28)}
        .svc-hint{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);width:min(460px,44vw);padding:10px 14px;border-radius:18px;background:rgba(8,14,30,.52);border:2px solid rgba(115,240,255,.45);box-shadow:0 0 22px rgba(0,240,255,.18);backdrop-filter:blur(12px);font-size:11px;font-weight:900;letter-spacing:.8px;text-align:center;pointer-events:none}
        @media(max-width:760px){.svc-hint{display:none}.svc-stick{width:132px;height:132px}.svc-action{right:18px;bottom:48px}}
      </style>
      <div class="svc-stick" data-stick><div class="svc-thumb" data-thumb></div><div class="svc-label">MENU STICK</div></div>
      <div class="svc-hint">STICK / D-PAD: NAVIGATE  ●  SELECT / A BUTTON: CONFIRM  ●  B / ESC: BACK</div>
      <div class="svc-action" data-action>SELECT</div>
    `;
    document.body.appendChild(root);

    const stick  = root.querySelector('[data-stick]')  as HTMLDivElement;
    const thumb  = root.querySelector('[data-thumb]')  as HTMLDivElement;
    const action = root.querySelector('[data-action]') as HTMLDivElement;

    // ── Helpers ──────────────────────────────────────────────────────────────
    const inInput = () => document.activeElement instanceof HTMLInputElement;

    // All focusable interactive elements not inside the controller itself
    const getItems = (): HTMLElement[] =>
      Array.from(document.querySelectorAll<HTMLElement>('button:not([disabled]), input'))
        .filter(el => el.offsetParent !== null && !root.contains(el));

    const paintFocus = () => {
      const items = getItems();
      if (!items.length) return;
      selIdx = Math.max(0, Math.min(selIdx, items.length - 1));
      const active = inInput();
      items.forEach((el, i) => {
        if (i === selIdx && !active) {
          el.style.outline = '3px solid rgba(0,255,255,.92)';
          el.style.boxShadow = '0 0 26px rgba(0,255,255,.72), 0 7px 0 rgba(0,0,0,.35)';
        } else {
          el.style.outline = '';
        }
      });
    };

    // 2D positional navigation: find nearest element in the given direction
    const nav = (dx: number, dy: number) => {
      const now = performance.now();
      if (now - lastNav < 190) return;
      if (inInput()) return;
      lastNav = now;

      const items = getItems();
      if (!items.length) return;
      selIdx = Math.max(0, Math.min(selIdx, items.length - 1));

      const cur = items[selIdx].getBoundingClientRect();
      const cx = cur.left + cur.width / 2;
      const cy = cur.top + cur.height / 2;

      let best = -1, bestScore = Infinity;
      items.forEach((el, i) => {
        if (i === selIdx) return;
        const r = el.getBoundingClientRect();
        const ex = (r.left + r.width / 2) - cx;
        const ey = (r.top + r.height / 2) - cy;
        const dot = ex * dx + ey * dy;
        if (dot <= 5) return; // element is not in the desired direction
        const perp = Math.abs(ex * dy - ey * dx);
        // penalise perpendicular offset; reward proximity
        const score = perp * 2.5 + dot;
        if (score < bestScore) { bestScore = score; best = i; }
      });

      if (best >= 0) {
        selIdx = best;
        if (navigator.vibrate) navigator.vibrate(12);
        paintFocus();
      }
    };

    const activate = () => {
      if (navigator.vibrate) navigator.vibrate(28);
      const items = getItems();
      const el = items[selIdx];
      if (!el) return;
      if (el instanceof HTMLInputElement) {
        el.focus(); el.select();
      } else {
        (el as HTMLButtonElement).click();
      }
    };

    const goBack = () => {
      if (inInput()) {
        (document.activeElement as HTMLInputElement).blur();
        return;
      }
      const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
        .find(b => b.offsetParent !== null && /←|back/i.test(b.textContent ?? ''));
      if (btn) btn.click();
    };

    // ── Virtual on-screen stick ──────────────────────────────────────────────
    const onStickMove = (e: PointerEvent) => {
      const rect = stick.getBoundingClientRect();
      const maxR = rect.width * 0.32;
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const dist = Math.min(maxR, Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx);
      const px = Math.cos(angle) * dist;
      const py = Math.sin(angle) * dist;
      thumb.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
      const nx = px / maxR, ny = py / maxR;
      if (Math.abs(nx) >= Math.abs(ny)) {
        if (Math.abs(nx) > 0.50) nav(Math.sign(nx), 0);
      } else {
        if (Math.abs(ny) > 0.50) nav(0, Math.sign(ny));
      }
    };
    stick.addEventListener('pointerdown', e => { e.preventDefault(); stick.setPointerCapture(e.pointerId); onStickMove(e); });
    stick.addEventListener('pointermove', e => { if (!stick.hasPointerCapture(e.pointerId)) return; e.preventDefault(); onStickMove(e); });
    const resetThumb = () => { thumb.style.transform = 'translate(-50%,-50%)'; };
    stick.addEventListener('pointerup', resetThumb);
    stick.addEventListener('pointercancel', resetThumb);
    action.addEventListener('pointerdown', e => { e.preventDefault(); activate(); });

    // ── Keyboard ─────────────────────────────────────────────────────────────
    const onKey = (e: KeyboardEvent) => {
      if (inInput()) {
        if (e.key === 'Escape') { (document.activeElement as HTMLInputElement).blur(); e.preventDefault(); }
        return;
      }
      if (e.key === 'ArrowLeft')        nav(-1,  0);
      else if (e.key === 'ArrowRight')  nav( 1,  0);
      else if (e.key === 'ArrowUp')     nav( 0, -1);
      else if (e.key === 'ArrowDown')   nav( 0,  1);
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
      else if (e.key === 'Escape')      goBack();
    };
    window.addEventListener('keydown', onKey);

    // ── Physical gamepad (A=confirm, B=back, D-pad + left stick navigate) ────
    const pollGamepad = () => {
      const gpads = navigator.getGamepads?.();
      if (gpads) {
        const gp = gpads[0] ?? gpads[1] ?? gpads[2] ?? gpads[3];
        if (gp) {
          const ax = gp.axes[0] ?? 0;
          const ay = gp.axes[1] ?? 0;
          const dL = gp.buttons[14]?.pressed;
          const dR = gp.buttons[15]?.pressed;
          const dU = gp.buttons[12]?.pressed;
          const dD = gp.buttons[13]?.pressed;
          const mx = dL ? -1 : dR ? 1 : Math.abs(ax) > 0.45 ? Math.sign(ax) : 0;
          const my = dU ? -1 : dD ? 1 : Math.abs(ay) > 0.45 ? Math.sign(ay) : 0;
          if (mx !== 0) nav(mx, 0);
          else if (my !== 0) nav(0, my);

          // A button — confirm/select
          if (gp.buttons[0]?.pressed && !gpHeld[0]) activate();
          gpHeld[0] = !!gp.buttons[0]?.pressed;

          // B button — back / exit input
          if (gp.buttons[1]?.pressed && !gpHeld[1]) goBack();
          gpHeld[1] = !!gp.buttons[1]?.pressed;

          // Y button — also confirm
          if (gp.buttons[3]?.pressed && !gpHeld[3]) activate();
          gpHeld[3] = !!gp.buttons[3]?.pressed;

          // Start / Options — confirm
          if (gp.buttons[9]?.pressed && !gpHeld[9]) activate();
          gpHeld[9] = !!gp.buttons[9]?.pressed;
        }
      }
      rafId = requestAnimationFrame(pollGamepad);
    };
    rafId = requestAnimationFrame(pollGamepad);

    const iv = window.setInterval(paintFocus, 250);
    paintFocus();

    return () => {
      clearInterval(iv);
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKey);
      root.remove();
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
    return <LobbyScreen onSolo={handleSolo} onFriends={handleFriends} />;
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
    </>
  );
}
