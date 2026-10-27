export const contractBlank = (value?: string | null): string =>
  value?.trim() || "____________________________________________";

export const contractVacancyLabel = (value: string): string =>
  value === "SOCIAL" ? "Social" : value === "PARTICULAR" ? "Particular" : value;

export const contractCurrency = (value: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));

export const contractEnrollmentValue = (charge: boolean, value: number): string =>
  charge ? contractCurrency(value) : "Não cobrada neste contrato";

export const contractEnrollmentWords = (charge: boolean, words: string): string =>
  charge ? words : "Não se aplica";
