import sys
import re

with open('src/routes/index.tsx', 'r') as f:
    content = f.read()

# 1. Ensure Imports
imports_to_add = [
    'import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";',
    'import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";',
    'import { Bot, UserRound, History, Settings2, Info } from "lucide-react";'
]

for imp in imports_to_add:
    if imp.split(' ')[1] not in content:
        content = re.sub(r'(import .* from "react";)', r'\1\n' + imp, content)

# 2. Update ScoreBox for a more Profile look
new_scorebox = '''function ScoreBox({
  title,
  bonnes,
  comptes,
  melds,
  isTurn,
  type,
}: {
  title: string;
  bonnes: number | null;
  comptes: number;
  melds: string[];
  isTurn?: boolean;
  type: "player" | "ai";
}) {
  return (
    <div className={cn(
      "panel flex flex-1 items-center gap-3 px-3 py-2 transition-all duration-300",
      isTurn ? "ring-2 ring-gold shadow-[0_0_15px_rgba(212,175,55,0.3)] bg-gold/5" : "opacity-90"
    )}>
      <Avatar className={cn("h-10 w-10 border-2 transition-colors shadow-sm", isTurn ? "border-gold" : "border-border")}>
        <AvatarFallback className="bg-gold/10 text-gold">
          {type === "ai" ? <Bot className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm text-gold truncate">{title}</span>
          {isTurn && (
             <span className="h-2 w-2 rounded-full bg-gold animate-pulse shadow-[0_0_8px_rgba(212,175,55,0.8)]" />
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0 text-[0.65rem] text-muted-foreground font-medium">
          <span>{bonnes ?? "?"} bonnes</span>
          <span>{comptes} pts</span>
        </div>
        {melds.length > 0 && (
          <p className="text-[0.6rem] text-gold/70 truncate italic mt-0.5">
            {melds.join(" • ")}
          </p>
        )}
      </div>
    </div>
  );
}'''

# Replace the existing ScoreBox function
content = re.sub(r'function ScoreBox\(.*?\{.*?\}\n\}', new_scorebox, content, flags=re.DOTALL)

# 3. Update the Header layout
new_header = '''      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[image:var(--gradient-gold)] flex items-center justify-center shadow-lg">
               <span className="text-primary-foreground font-display font-bold">A</span>
            </div>
            <h1 className="gold-text text-2xl sm:text-3xl tracking-tight">Aztèque</h1>
          </div>
          
          <div className="flex items-center gap-1.5 sm:gap-3">
            <Select
              value={settings.difficulty}
              onValueChange={(v) => setSettings(s => ({ ...s, difficulty: v as Difficulty }))}
            >
              <SelectTrigger className="h-8 w-[100px] sm:w-[120px] text-[0.7rem] border-gold/40 bg-secondary/30">
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

            <div className="flex items-center gap-1 sm:gap-2 ml-1">
              <button
                onClick={() => setShowHistory(true)}
                title="Historique"
                className="p-2 rounded-full border border-gold/20 hover:bg-gold/10 transition-colors text-gold"
              >
                <History className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowSettings(true)}
                title="Paramètres"
                className="p-2 rounded-full border border-gold/20 hover:bg-gold/10 transition-colors text-gold"
              >
                <Settings2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setShowRules(true)}
                title="Règles"
                className="p-2 rounded-full border border-gold/20 hover:bg-gold/10 transition-colors text-gold"
              >
                <Info className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-3 items-stretch">
           <ScoreBox
             title="Ordinateur"
             type="ai"
             isTurn={state.turn === 1}
             bonnes={revealOpp ? oppBonnes : null}
             comptes={live1.comptes}
             melds={state.melds[1].map(
               (m) =>
                 `${SUIT_SYMBOL[m.suit]} ${m.type === "triple" ? "t" : "s"} (${m.points})`,
             )}
           />

           <div className="flex flex-row lg:flex-col items-center justify-center gap-3 lg:gap-1 min-w-[140px] panel px-4 py-2 bg-felt-deep/40 border-gold/20 shadow-inner">
              <div className="flex gap-2 items-center">
                 <Chip label="Tours" value={`${state.roundsWon[1]} - ${state.roundsWon[0]}`} />
                 <Chip label="Stock" value={String(state.stock.length)} />
              </div>
              <div className="h-px w-8 bg-gold/20 hidden lg:block my-1" />
              <Chip
                label="Atout"
                value={state.trump ? `${SUIT_SYMBOL[state.trump]} ${SUIT_NAME[state.trump]}` : "—"}
                highlight={!!state.trump}
                className="flex-1 lg:w-full text-center"
              />
           </div>

           <ScoreBox
             title={typeof playerName !== "undefined" ? playerName : "Vous"}
             type="player"
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

content = re.sub(r'<header.*?</header>', new_header, content, flags=re.DOTALL)

# 4. Remove redundant counter from table
content = content.replace('''                <span className="rounded-full border border-gold/40 bg-felt-deep px-2 py-0.5 text-[0.65rem] font-semibold text-gold">
                  {state.stock.length}
                </span>''', '')

with open('src/routes/index.tsx', 'w') as f:
    f.write(content)
