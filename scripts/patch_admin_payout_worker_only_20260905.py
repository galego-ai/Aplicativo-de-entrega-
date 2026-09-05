from pathlib import Path
p=Path('apps/admin/app/repasses/page.tsx')
s=p.read_text()
old=''' async function efiPayout(p:Payout,action:"SEND"|"STATUS"){setBusy(p.id);setMessage("");const{data,error}=await supabase.functions.invoke("efi-payout-action",{body:{action,payoutId:p.id}});setBusy("");const code=String(data?.error??"");if(error||code){if(code==="EFI_PAYOUT_ANOTHER_TRANSFER_PROCESSING")setMessage("Já existe outro envio Pix Efí em processamento. Aguarde a conclusão antes de iniciar o próximo.");else if(code==="EFI_PAYOUT_CONFIRMATION_PENDING")setMessage("A Efí ainda não confirmou o resultado. O repasse permanece PROCESSANDO e deve ser consultado novamente; nenhum segundo Pix será criado.");else if(code==="EFI_PAYOUT_REJECTED")setMessage("A Efí rejeitou o envio Pix. O saldo reservado foi liberado e o repasse ficou como FALHOU para nova tentativa.");else if(code==="INSUFFICIENT_AVAILABLE_BALANCE")setMessage("O saldo disponível mudou e já não cobre este repasse.");else setMessage(action==="SEND"?"Não foi possível iniciar o envio Pix pela Efí.":"Não foi possível consultar o envio Pix na Efí.");await load();return;}const ps=String(data?.providerStatus??"").toUpperCase();setMessage(ps==="REALIZADO"?"Pix enviado e confirmado pela Efí. O repasse foi marcado como PAGO.":"Envio registrado na Efí. O repasse ficará PROCESSANDO até a confirmação do webhook.");await load();}
'''
if old not in s: raise SystemExit('efiPayout function not found')
s=s.replace(old,'',1)
s=s.replace('''{provider?.automatic_processing?"Automático ativo: o worker processa somente repasses PIX já aprovados pela Matriz, um por vez, e reconcilia o resultado pela Efí.":"Automático desligado: a Matriz aprova e confirma cada envio individualmente. As credenciais permanecem somente no backend."}''','''{provider?.automatic_processing?"Processamento Efí ativo: o worker envia somente repasses PIX APROVADOS pela Matriz, um por vez, usando o gateway Node com certificado PKCS#12, e reconcilia o resultado.":"Processamento Efí pausado: a Matriz pode aprovar/rejeitar normalmente, mas nenhum PIX será enviado até ativar o processamento seguro da fila."}''',1)
s=s.replace('''{providerBusy?"AGUARDE...":provider?.automatic_processing?"DESATIVAR AUTOMÁTICO":"ATIVAR AUTOMÁTICO"}''','''{providerBusy?"AGUARDE...":provider?.automatic_processing?"PAUSAR PROCESSAMENTO EFI":"ATIVAR PROCESSAMENTO EFI"}''',1)
s=s.replace('''if(enabled&&!window.confirm("Ativar envio automático? Somente repasses PIX já APROVADOS pela Matriz serão enviados, um por vez."))return;''','''if(enabled&&!window.confirm("Ativar o processamento Efí? A partir deste momento, todo repasse PIX que a Matriz APROVAR poderá ser enviado automaticamente pelo worker, um por vez. Confirma?"))return;''',1)
s=s.replace('''setMessage(enabled?"Envio automático ATIVADO. Apenas repasses PIX aprovados entrarão na fila automática.":"Envio automático DESATIVADO. Repasses aprovados permanecerão aguardando envio manual.");''','''setMessage(enabled?"Processamento Efí ATIVADO. Apenas repasses PIX APROVADOS pela Matriz entram na fila segura do worker.":"Processamento Efí PAUSADO. Repasses aprovados permanecerão aguardando na fila.");''',1)
old_actions='''{p.status==="APPROVED"&&p.method==="PIX"&&efiReady&&<><button disabled={busy===p.id} onClick={()=>efiPayout(p,"SEND")}>{busy===p.id?"ENVIANDO...":"ENVIAR PIX PELA EFÍ"}</button><button className="danger" disabled={busy===p.id} onClick={()=>status(p,"REJECTED")}>Rejeitar</button></>}'''
new_actions='''{p.status==="APPROVED"&&p.method==="PIX"&&efiReady&&<><button disabled>{provider?.automatic_processing?"NA FILA SEGURA EFI":"AGUARDANDO ATIVAR PROCESSAMENTO EFI"}</button><button className="danger" disabled={busy===p.id} onClick={()=>status(p,"REJECTED")}>Rejeitar</button></>}'''
if old_actions not in s: raise SystemExit('approved efi actions not found')
s=s.replace(old_actions,new_actions,1)
old_processing='''{p.status==="PROCESSING"&&efiTransfer&&<button disabled={busy===p.id} onClick={()=>efiPayout(p,"STATUS")}>{busy===p.id?"CONSULTANDO...":"CONSULTAR EFÍ"}</button>}'''
new_processing='''{p.status==="PROCESSING"&&efiTransfer&&<button disabled={busy===p.id} onClick={load}>ATUALIZAR STATUS</button>}'''
if old_processing not in s: raise SystemExit('processing action not found')
s=s.replace(old_processing,new_processing,1)
old_failed='''{p.status==="FAILED"&&p.method==="PIX"&&efiReady?<button disabled={busy===p.id} onClick={()=>efiPayout(p,"SEND")}>{busy===p.id?"TENTANDO...":"TENTAR PIX NOVAMENTE"}</button>:p.status==="FAILED"&&<button disabled={busy===p.id} onClick={()=>status(p,"PROCESSING")}>Tentar manualmente</button>}'''
new_failed='''{p.status==="FAILED"&&<button disabled={busy===p.id} onClick={()=>status(p,"PROCESSING")}>REABRIR PARA REVISÃO</button>}'''
if old_failed not in s: raise SystemExit('failed action not found')
s=s.replace(old_failed,new_failed,1)
p.write_text(s)
print('ADMIN_PAYOUT_WORKER_ONLY_OK')
