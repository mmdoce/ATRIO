import assert from "node:assert/strict";
import test from "node:test";
import {
  cancelPayment,
  confirmPayment,
  createPaymentFormData,
  validateFullPayment,
} from "../src/paymentFlow.ts";

test("valida pagamento integral e bloqueia pagamento parcial", () => {
  assert.equal(validateFullPayment("1.250,00", 125000), null);
  assert.match(validateFullPayment("1.000,00", 125000) ?? "", /Pagamentos parciais não são aceitos/);
  assert.match(validateFullPayment("inválido", 125000) ?? "", /valor válido/);
});

test("monta multipart com os nomes exigidos pelo endpoint e anexo opcional", async () => {
  const receipt = new File(["conteúdo fictício"], "comprovante.pdf", { type: "application/pdf" });
  const form = createPaymentFormData({
    mensalidade_id: "00000000-0000-4000-8000-000000000001",
    valor_pago: "1250.00",
    forma_pagamento: "pix",
    comprovante: receipt,
  });
  assert.equal(form.get("mensalidade_id"), "00000000-0000-4000-8000-000000000001");
  assert.equal(form.get("valor_pago"), "1250.00");
  assert.equal(form.get("forma_pagamento"), "pix");
  assert.equal((form.get("comprovante") as File).name, "comprovante.pdf");
  const noReceipt = createPaymentFormData({ mensalidade_id: "id", valor_pago: "1.00", forma_pagamento: "dinheiro" });
  assert.equal(noReceipt.get("comprovante"), null);
});

test("sucesso confirma e chama atualização; falha não atualiza a lista", async () => {
  let refreshed = 0;
  const payload = { mensalidade_id: "bill", valor_pago: "5.00", forma_pagamento: "pix" };
  const success = await confirmPayment(payload, async (sent) => sent, () => { refreshed += 1; });
  assert.deepEqual(success, { success: true });
  assert.equal(refreshed, 1);
  const failure = await confirmPayment(payload, async () => { throw new Error("falha fictícia"); }, () => { refreshed += 1; });
  assert.equal(failure.success, false);
  assert.equal(refreshed, 1);
});

test("cancelamento fecha a ação sem enviar pagamento", () => {
  let canceled = false;
  cancelPayment(() => { canceled = true; });
  assert.equal(canceled, true);
});
