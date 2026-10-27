import assert from "node:assert/strict";
import test from "node:test";
import { contractBlank, contractCurrency, contractEnrollmentValue, contractEnrollmentWords, contractVacancyLabel } from "../src/contractDocument.ts";

test("document uses the backend vacancy labels and BRL formatting", () => {
  assert.equal(contractVacancyLabel("SOCIAL"), "Social");
  assert.equal(contractVacancyLabel("PARTICULAR"), "Particular");
  assert.equal(contractVacancyLabel("MENSAL"), "MENSAL");
  assert.equal(contractCurrency(1250.5), "R$ 1.250,50");
});

test("missing personal values stay blank and matrícula follows the persisted flag", () => {
  assert.match(contractBlank(null), /^_{10,}$/);
  assert.equal(contractEnrollmentValue(false, 350), "Não cobrada neste contrato");
  assert.equal(contractEnrollmentWords(false, "trezentos e cinquenta reais"), "Não se aplica");
  assert.equal(contractEnrollmentValue(true, 350), "R$ 350,00");
  assert.equal(contractEnrollmentWords(true, "trezentos e cinquenta reais"), "trezentos e cinquenta reais");
});
