from pathlib import Path
p=Path('apps/lojista/app/repasses/page.tsx')
s=p.read_text()
old='type Anticipation={availableGross:number;fee:number;net:number;maxDays:number;minRateMonthly:number;maxRateMonthly:number;details:any[]};'
new='type Anticipation={availableGross:number;fee:number;net:number;maxDays:number;minRateMonthly:number;maxRateMonthly:number;requestedGross?:number;details:any[]};'
if old not in s:
    raise SystemExit('tipo alvo nao encontrado')
p.write_text(s.replace(old,new,1))
print('ANTICIPATION_TYPE_FIXED')
