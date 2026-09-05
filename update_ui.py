import sys

with open('src/routes/index.tsx', 'r') as f:
    content = f.read()

# Add imports
old_import = 'import { useCallback, useEffect, useMemo, useRef, useState } from "react";'
new_import = 'import { useCallback, useEffect, useMemo, useRef, useState } from "react";\nimport { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";\nimport { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";'
if new_import not in content:
    content = content.replace(old_import, new_import)

# Update ScoreBox component
old_scorebox = '''function ScoreBox({
  title,
  bonnes,
  comptes,
  melds,
}: {
  title: string;
  bonnes: number | null;
  comptes: number;
  melds: string[];
}) {
  return (
    <div className="panel flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-xs">
      <span className="font-display text-sm text-gold">{title}</span>
      <span className="text-muted-foreground">Bonnes · {bonnes ?? "?"}</span>
      <span className="text-muted-foreground">Comptes · {comptes}</span>
      {melds.length > 0 && (
        <span className="text-[0.65rem] text-muted-foreground">{melds.join(" | ")}</span>
      )}
    </div>
  );
}'''

new_scorebox = '''function ScoreBox({
  title,
  bonnes,
  comptes,
  melds,
  isTurn,
  avatar,
}: {
  title: string;
  bonnes: number | null;
  comptes: number;
  melds: string[];
  isTurn?: boolean;
  avatar?: string;
}) {
  return (
    <div className={cn(
      "panel flex flex-1 items-center gap-3 px-4 py-2 transition-all duration-300",
      isTurn ? "ring-2 ring-gold shadow-[0_0_15px_rgba(212,175,55,0.3)]" : "opacity-90"
    )}>
      <Avatar className={cn("h-10 w-10 border-2 transition-colors", isTurn ? "border-gold" : "border-border")}>
        <AvatarImage src={avatar} />
        <AvatarFallback className="bg-gold/10 text-gold">{title[0]}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm text-gold truncate">{title}</span>
          {isTurn && (
             <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0 text-[0.65rem] text-muted-foreground">
          <span>Bonnes: {bonnes ?? "?"}</span>
          <span>Comptes: {comptes}</span>
        </div>
        {melds.length > 0 && (
          <p className="text-[0.6rem] text-muted-foreground/80 truncate italic">
            {melds.join(" | ")}
          </p>
        )}
      </div>
    </div>
  );
}'''
if old_scorebox in content:
    content = content.replace(old_scorebox, new_scorebox)

# Update the Header to include profiles and difficulty select
old_header = '''      <header className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <h1 className="gold-text text-2xl leading-none">Aztèque</h1>
          <p className="text-[0.7rem] text-muted-foreground">
            Tours gagnés — Vous {state.roundsWon[0]} · Adversaire {state.roundsWon[1]} ·{" "}
            {DIFFICULTY_LABEL[settings.difficulty]}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Chip label="Pioche" value={String(state.stock.length)} />
          <Chip
            label="Atout"
            value={
              state.trump ? `${SUIT_SYMBOL[state.trump]} ${SUIT_NAME[state.trump]}` : "—"
            }
            highlight={!!state.trump}
          />
          <button
            onClick={() => setShowHistory(true)}
            className="rounded-full border border-gold/40 px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
          >
            Comptes · {meldHistory.length}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="rounded-full border border-gold/40 px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
          >
            Paramètres
          </button>

          <button
            onClick={() => setShowRules(true)}
            className="rounded-full border border-gold/40 px-3 py-1.5 text-xs transition-colors hover:bg-secondary"
          >
            Règles
          </button>
        </div>
      </header>'''

new_header = '''      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="gold-text text-3xl">Aztèque</h1>
          
          <div className="flex items-center gap-2">
            <Select
              value={settings.difficulty}
              onValueChange={(v) => setSettings(s => ({ ...s, difficulty: v as Difficulty }))}
            >
              <SelectTrigger className="h-8 w-[110px] text-xs border-gold/40">
                <SelectValue placeholder="Difficulté" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
                  <SelectItem key={d} value={d} className="text-xs">
                    {DIFFICULTY_LABEL[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <button
              onClick={() => setShowHistory(true)}
              className="rounded-full border border-gold/40 px-3 py-1.5 text-[0.7rem] transition-colors hover:bg-secondary"
            >
              Historique
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="rounded-full border border-gold/40 px-3 py-1.5 text-[0.7rem] transition-colors hover:bg-secondary"
            >
              Paramètres
            </button>
            <button
              onClick={() => setShowRules(true)}
              className="rounded-full border border-gold/40 px-3 py-1.5 text-[0.7rem] transition-colors hover:bg-secondary"
            >
              Règles
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch">
           <ScoreBox
             title="Adversaire"
             isTurn={state.turn === 1}
             bonnes={revealOpp ? oppBonnes : null}
             comptes={live1.comptes}
             melds={state.melds[1].map(
               (m) =>
                 `${SUIT_SYMBOL[m.suit]} ${m.type === "triple" ? "t" : "s"} (${m.points})`,
             )}
           />

           <div className="flex flex-col items-center justify-center gap-1 min-w-[120px] panel px-3 py-2 bg-felt-deep/40">
              <div className="flex gap-2 items-center">
                 <Chip label="Tours" value={`${state.roundsWon[1]} - ${state.roundsWon[0]}`} />
                 <Chip label="Stock" value={String(state.stock.length)} />
              </div>
              <Chip
                label="Atout"
                value={state.trump ? `${SUIT_SYMBOL[state.trump]} ${SUIT_NAME[state.trump]}` : "—"}
                highlight={!!state.trump}
                className="w-full text-center"
              />
           </div>

           <ScoreBox
             title="Vous"
             isTurn={state.turn === 0}
             bonnes={myBonnes}
             comptes={live0.comptes}
             melds={state.melds[0].map(
               (m) =>
                 `${SUIT_SYMBOL[m.suit]} ${m.type === "triple" ? "t" : "s"} (${m.points})`,
             )}
           />
        </div>
      </header>'''
if old_header in content:
    content = content.replace(old_header, new_header)

# Remove the old individual ScoreBox sections
old_box_opp = '''          <ScoreBox
            title="Adversaire"
            bonnes={revealOpp ? oppBonnes : null}
            comptes={live1.comptes}
            melds={state.melds[1].map(
              (m) =>
                `${SUIT_SYMBOL[m.suit]} ${m.type === "triple" ? "triple" : "simple"} (${m.points})`,
            )}
          />'''
if old_box_opp in content:
    content = content.replace(old_box_opp, '')

old_box_you = '''        <ScoreBox
          title="Vous"
          bonnes={myBonnes}
          comptes={live0.comptes}
          melds={state.melds[0].map(
            (m) =>
              `${SUIT_SYMBOL[m.suit]} ${m.type === "triple" ? "triple" : "simple"} (${m.points})`,
          )}
        />'''
if old_box_you in content:
    content = content.replace(old_box_you, '')

# Adjust Chip component to accept className
old_chip = '''function Chip({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-3 py-1.5",
        highlight ? "border-gold/60 text-gold" : "border-border text-muted-foreground",
      )}
    >
      {label} · {value}
    </span>
  );
}'''

new_chip = '''function Chip({
  label,
  value,
  highlight,
  className,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-1 text-[0.6rem]",
        highlight ? "border-gold/60 text-gold bg-gold/5" : "border-border text-muted-foreground",
        className
      )}
    >
      {label} · {value}
    </span>
  );
}'''
if old_chip in content:
    content = content.replace(old_chip, new_chip)

with open('src/routes/index.tsx', 'w') as f:
    f.write(content)
