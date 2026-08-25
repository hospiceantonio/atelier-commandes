/* =========================================================
   Webhook KKiaPay -> prolongation d'abonnement.

   Déploiement (tableau de bord Supabase) :
   - Edge Functions -> Deploy a new function -> nom : kkiapay-webhook,
     coller ce fichier, puis DÉSACTIVER « Verify JWT » (KKiaPay
     n'envoie aucun jeton Supabase).
   - Edge Functions -> Secrets : KKIAPAY_WEBHOOK_SECRET = le secret
     défini dans le tableau de bord KKiaPay (section Webhook).
   - Côté KKiaPay (dans le MÊME mode, bac à sable ou live, que la clé
     publique utilisée par l'application) déclarer l'URL :
     https://<projet>.supabase.co/functions/v1/kkiapay-webhook

   Sécurité :
   - le secret est comparé à durée constante ;
   - le montant crédité est celui annoncé par KKiaPay ;
   - le crédit est idempotent (référence kkiapay:<transactionId>),
     KKiaPay rejouant sa notification jusqu'à 5 fois ;
   - un événement qui ne nous concerne pas répond 200 pour ne pas
     déclencher de nouvelles tentatives.
   ========================================================= */

const SECRET = Deno.env.get("KKIAPAY_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const CLE_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function egaliteConstante(a: string, b: string): boolean {
  const ta = new TextEncoder().encode(a);
  const tb = new TextEncoder().encode(b);
  if (ta.length !== tb.length) return false;
  let difference = 0;
  for (let i = 0; i < ta.length; i++) difference |= ta[i] ^ tb[i];
  return difference === 0;
}

/* L'identifiant d'atelier voyage dans le champ « data » du widget et
   revient sous un nom qui varie selon les versions de KKiaPay. */
function extraireAtelierId(corps: Record<string, unknown>): string | null {
  for (const brut of [corps.stateData, corps.state, corps.data]) {
    if (!brut) continue;
    let valeur: unknown = brut;
    if (typeof valeur === "string") {
      try { valeur = JSON.parse(valeur); } catch { continue; }
    }
    const objet = valeur as Record<string, unknown>;
    if (objet && typeof objet.atelier_id === "string") return objet.atelier_id;
  }
  return null;
}

Deno.serve(async (requete: Request): Promise<Response> => {
  if (requete.method !== "POST") return new Response("ok", { status: 200 });

  const secretRecu = requete.headers.get("x-kkiapay-secret") ?? "";
  if (!SECRET || !egaliteConstante(secretRecu, SECRET)) {
    return new Response("non autorisé", { status: 401 });
  }

  let corps: Record<string, unknown>;
  try {
    corps = await requete.json();
  } catch {
    return new Response("ok", { status: 200 });
  }

  const succes =
    corps.isPaymentSucces === true ||
    String(corps.event ?? "").toLowerCase().includes("success") ||
    String(corps.status ?? "").toUpperCase() === "SUCCESS";
  const transactionId = corps.transactionId ? String(corps.transactionId) : "";
  const montant = Number(corps.amount);
  const atelierId = extraireAtelierId(corps);

  if (!succes || !transactionId || !atelierId || !Number.isFinite(montant) || montant <= 0) {
    return new Response("ignoré", { status: 200 });
  }

  const reponse = await fetch(SUPABASE_URL + "/rest/v1/rpc/prolonger_abonnement_kkiapay", {
    method: "POST",
    headers: {
      "apikey": CLE_SERVICE,
      "Authorization": "Bearer " + CLE_SERVICE,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_atelier: atelierId,
      p_reference: "kkiapay:" + transactionId,
      p_montant: montant,
    }),
  });

  if (!reponse.ok) {
    // 5xx : KKiaPay retentera, ce qui est voulu (le crédit est idempotent).
    return new Response("erreur base", { status: 500 });
  }
  return new Response(await reponse.text(), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
