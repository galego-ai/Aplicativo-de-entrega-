import { withSupabase } from "npm:@supabase/server@1.4.1";

type ReadinessStatus="READY"|"ATTENTION"|"PENDING_EXTERNAL"|"DEFERRED"|"READY_PROTECTED";
type ReadinessItem={key:string;label:string;status:ReadinessStatus;detail:string;blocking:boolean};

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    const role = String(ctx.userClaims!.appMetadata?.clickfood_role ?? "");
    if (!["SUPER_ADMIN", "ADMIN", "SUPPORT"].includes(role)) {
      return Response.json({ error: "ADMIN_REQUIRED" }, { status: 403 });
    }

    const [healthResult, paymentResult, payoutResult, ticketResult, pushResult, driverPendingResult, docPendingResult, docExpiredResult, storeGpsResult, storeCityResult, legalResult] = await Promise.all([
      ctx.supabaseAdmin.schema("private").rpc("admin_operational_health"),
      ctx.supabaseAdmin
        .from("payment_provider_configs")
        .select("provider,display_name,environment,enabled,credentials_configured,supported_methods,updated_at")
        .eq("provider", "EFI")
        .maybeSingle(),
      ctx.supabaseAdmin
        .from("payout_provider_configs")
        .select("provider,display_name,environment,enabled,credentials_configured,automatic_processing,validated_at,updated_at")
        .eq("provider", "EFI_PIX_SEND")
        .maybeSingle(),
      ctx.supabaseAdmin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .in("status", ["OPEN", "IN_PROGRESS"])
        .in("priority", ["HIGH", "CRITICAL"]),
      ctx.supabaseAdmin.from("device_push_tokens").select("id",{count:"exact",head:true}).eq("enabled",true),
      ctx.supabaseAdmin.from("drivers").select("id",{count:"exact",head:true}).eq("status","PENDING"),
      ctx.supabaseAdmin.from("driver_documents").select("id",{count:"exact",head:true}).eq("status","PENDING"),
      ctx.supabaseAdmin.from("driver_documents").select("id",{count:"exact",head:true}).lt("expires_at",new Date().toISOString().slice(0,10)).neq("status","REJECTED"),
      ctx.supabaseAdmin.from("stores").select("id",{count:"exact",head:true}).eq("status","ACTIVE").or("latitude.is.null,longitude.is.null"),
      ctx.supabaseAdmin.from("stores").select("id",{count:"exact",head:true}).eq("status","ACTIVE").is("city_id",null),
      ctx.supabaseAdmin.from("legal_documents").select("id",{count:"exact",head:true}).eq("active",true).not("published_at","is",null),
    ]);

    if (healthResult.error) return Response.json({ error: "HEALTH_CHECK_FAILED" }, { status: 500 });

    const health:any=healthResult.data??{};
    const payment:any=paymentResult.data??null;
    const payout:any=payoutResult.data??null;
    const paymentMethods:string[]=Array.isArray(payment?.supported_methods)?payment.supported_methods:[];
    const pushTokens=pushResult.count??0;
    const pendingDrivers=driverPendingResult.count??0;
    const pendingDocuments=docPendingResult.count??0;
    const expiredDocuments=docExpiredResult.count??0;
    const storesWithoutGps=storeGpsResult.count??0;
    const storesWithoutCity=storeCityResult.count??0;
    const legalDocuments=legalResult.count??0;

    const readiness:ReadinessItem[]=[
      {
        key:"core_integrity",label:"Núcleo operacional e financeiro",
        status:Number(health?.total_issues??0)===0?"READY":"ATTENTION",
        detail:Number(health?.total_issues??0)===0?"Pedidos, pagamentos, estoque, entregas, caixas, estornos, repasses e jobs estão consistentes.":`${Number(health?.total_issues??0)} alerta(s) precisam ser tratados na Saúde Operacional.`,
        blocking:Number(health?.total_issues??0)>0,
      },
      {
        key:"efi_pix",label:"Efí PIX para cobrança de clientes",
        status:payment?.enabled&&payment?.credentials_configured&&paymentMethods.includes("PIX")?"READY":"ATTENTION",
        detail:payment?.enabled&&payment?.credentials_configured&&paymentMethods.includes("PIX")?`${payment.environment} validado, PIX liberado e credenciais protegidas no backend.`:"PIX Efí ainda não está completamente validado/ativado.",
        blocking:!(payment?.enabled&&payment?.credentials_configured&&paymentMethods.includes("PIX")),
      },
      {
        key:"efi_card",label:"Cartão Efí",
        status:payment?.enabled&&paymentMethods.includes("CREDIT_CARD")?"READY":"PENDING_EXTERNAL",
        detail:payment?.enabled&&paymentMethods.includes("CREDIT_CARD")?"Cartão de crédito Efí validado e liberado.":"Infraestrutura pronta; falta a validação externa específica da API de Cobranças/EFI_ACCOUNT_ID antes de liberar ao cliente.",
        blocking:false,
      },
      {
        key:"efi_payout",label:"Repasses Pix pela Efí",
        status:payout?.credentials_configured&&payout?.validated_at?(payout.enabled?"READY":"READY_PROTECTED"):"PENDING_EXTERNAL",
        detail:payout?.credentials_configured&&payout?.validated_at?(payout.enabled?`Envio Efí ativo; processamento automático ${payout.automatic_processing?"ON":"OFF"}.`:"Credenciais e escopos já validados; envio permanece protegido/OFF até decisão da Matriz."):"Validação externa do envio Pix ainda pendente.",
        blocking:false,
      },
      {
        key:"driver_onboarding",label:"Cadastro e documentos de entregadores",
        status:pendingDrivers===0&&pendingDocuments===0&&expiredDocuments===0?"READY":"ATTENTION",
        detail:pendingDrivers===0&&pendingDocuments===0&&expiredDocuments===0?"Nenhum cadastro/documento pendente ou vencido.":`${pendingDrivers} cadastro(s) pendente(s), ${pendingDocuments} documento(s) em análise e ${expiredDocuments} vencido(s).`,
        blocking:false,
      },
      {
        key:"store_location",label:"Localização operacional das lojas",
        status:storesWithoutGps===0&&storesWithoutCity===0?"READY":"ATTENTION",
        detail:storesWithoutGps===0&&storesWithoutCity===0?"Todas as lojas ativas possuem cidade e coordenadas operacionais.":`${storesWithoutGps} loja(s) ativa(s) sem GPS e ${storesWithoutCity} sem cidade.`,
        blocking:storesWithoutGps>0||storesWithoutCity>0,
      },
      {
        key:"legal",label:"Documentos legais no aplicativo",
        status:legalDocuments>0?"READY":"ATTENTION",
        detail:legalDocuments>0?`${legalDocuments} documento(s) legal(is) ativo(s) e publicado(s), com aceite versionado pelo sistema.`:"Nenhum documento legal ativo/publicado.",
        blocking:legalDocuments===0,
      },
      {
        key:"mobile_push",label:"Build EAS e push em aparelho real",
        status:pushTokens>0?"READY":"PENDING_EXTERNAL",
        detail:pushTokens>0?`${pushTokens} dispositivo(s) com push ativo registrado(s).`:"Backend de push está pronto; ainda não há dispositivo registrado porque falta instalar um build EAS vinculado ao projeto Expo.",
        blocking:false,
      },
      {
        key:"maps",label:"Google Maps / Mapbox",
        status:"DEFERRED",
        detail:"Programado deliberadamente para a etapa final, depois de todos os módulos funcionais e financeiros.",
        blocking:false,
      },
    ];

    const blocking=readiness.filter(item=>item.blocking&&item.status!=="READY");
    const externalPending=readiness.filter(item=>item.status==="PENDING_EXTERNAL");
    const deferred=readiness.filter(item=>item.status==="DEFERRED");

    return Response.json({
      health,
      providers:{payments:payment,payouts:payout},
      criticalSupportTickets:ticketResult.count??0,
      readiness:{
        phaseStatus:blocking.length?"BLOCKED":externalPending.length||deferred.length?"FUNCTIONAL_READY_EXTERNAL_PENDING":"READY",
        blockingCount:blocking.length,
        externalPendingCount:externalPending.length,
        deferredCount:deferred.length,
        items:readiness,
        metrics:{pushTokens,pendingDrivers,pendingDocuments,expiredDocuments,storesWithoutGps,storesWithoutCity,legalDocuments},
      },
    });
  }),
};
